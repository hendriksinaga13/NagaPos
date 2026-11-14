/**
 * src/services/report-service.js
 * Agregasi laporan dari `sales` dan `stockMovements`.
 *
 * Metrik:
 *  - Omzet: total sale.total (exclude void, exclude debt-payment).
 *  - Laba: total sale - HPP.
 *  - HPP dihitung dari `sale.items[].cost` jika tersedia; fallback:
 *    HPP = qty * factor * product.cost (product.cost saat ini).
 *  - Produk terlaris: agregasi per productId.
 */

/**
 * @typedef {Object} ReportPeriod
 * @property {number} from  epoch ms, inclusive
 * @property {number} to    epoch ms, exclusive
 */

/**
 * @param {number} from
 * @param {number} to
 * @param {import('../core/schema.js').Sale[]} sales
 */
function filterSales(sales, from, to) {
  return sales.filter((s) => {
    if (s.deleted) return false;
    if (s.status === 'void') return false;
    if (s.isDebtPayment) return false;
    return s.createdAt >= from && s.createdAt < to;
  });
}

/**
 * Hitung HPP baris penjualan. Memakai cost pada produk saat ini,
 * karena sale item tidak menyimpan cost snapshot.
 * @param {object} ctx
 * @param {import('../core/schema.js').Sale[]} sales
 * @returns {Promise<number>}
 */
async function computeCogs(ctx, sales) {
  /** @type {Map<string, number>} */
  const costMap = new Map();
  const productIds = new Set();
  for (const s of sales) for (const it of s.items) productIds.add(it.productId);

  const products = await ctx.repos.products.list();
  for (const p of products) if (productIds.has(p.id)) costMap.set(p.id, p.cost || 0);

  let cogs = 0;
  for (const s of sales) {
    for (const it of s.items) {
      const cost = costMap.get(it.productId) || 0;
      cogs += Math.round(cost * (it.qty * it.factor));
    }
  }
  return cogs;
}

/**
 * Produk terlaris dalam periode.
 * @param {object} ctx
 * @param {ReportPeriod} period
 * @param {number} [limit]
 */
export async function bestSellers(ctx, period, limit = 10) {
  const all = await ctx.repos.sales.list();
  const sales = filterSales(all, period.from, period.to);

  /** @type {Map<string, { productId:string, qtyBase:number, revenue:number }>} */
  const agg = new Map();
  for (const s of sales) {
    for (const it of s.items) {
      const cur = agg.get(it.productId) || { productId: it.productId, qtyBase: 0, revenue: 0 };
      cur.qtyBase += it.qty * it.factor;
      cur.revenue += it.total;
      agg.set(it.productId, cur);
    }
  }

  const products = await ctx.repos.products.list();
  const nameMap = new Map(products.map((p) => [p.id, p.name]));

  return [...agg.values()]
    .map((v) => ({ ...v, name: nameMap.get(v.productId) || '(dihapus)' }))
    .sort((a, b) => b.qtyBase - a.qtyBase)
    .slice(0, limit);
}

/**
 * Ringkasan periode.
 * @param {object} ctx
 * @param {ReportPeriod} period
 */
export async function summary(ctx, period) {
  const all = await ctx.repos.sales.list();
  const sales = filterSales(all, period.from, period.to);

  let revenue = 0;
  let transactionCount = sales.length;
  let itemsSold = 0;
  let discountTotal = 0;
  let debtIssued = 0;
  /** @type {Record<string, number>} */
  const byMethod = {};

  for (const s of sales) {
    revenue += s.total || 0;
    discountTotal += s.discountTotal || 0;
    debtIssued += s.debtAmount || 0;
    for (const it of s.items) itemsSold += it.qty;
    for (const p of s.payments || []) {
      byMethod[p.method] = (byMethod[p.method] || 0) + (p.amount || 0);
    }
  }

  // Piutang yang dibayar (sale dengan isDebtPayment).
  let debtPayments = 0;
  for (const s of all) {
    if (s.deleted || s.status === 'void' || !s.isDebtPayment) continue;
    if (s.createdAt < period.from || s.createdAt >= period.to) continue;
    for (const p of s.payments || []) debtPayments += p.amount || 0;
  }

  const cogs = await computeCogs(ctx, sales);
  const profit = revenue - cogs;

  return {
    period,
    revenue,
    transactionCount,
    itemsSold,
    discountTotal,
    debtIssued,
    debtPayments,
    cogs,
    profit,
    byMethod,
    sales,
  };
}

/**
 * Rentang hari (00:00 s/d 23:59) di zona lokal.
 * @param {Date|string} date
 * @returns {ReportPeriod}
 */
export function dayRange(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  const from = d.getTime();
  const to = from + 24 * 60 * 60 * 1000;
  return { from, to };
}

/**
 * Rentang bulan dalam zona lokal.
 * @param {number} year
 * @param {number} month  1-12
 */
export function monthRange(year, month) {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  return { from, to };
}