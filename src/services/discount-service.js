/**
 * src/services/discount-service.js
 * Fungsi murni untuk memfilter diskon yang berlaku dan menghitung nominal.
 *
 * Aturan penggabungan:
 *  - Urutkan kandidat berdasarkan priority DESC.
 *  - Jika ada diskon non-stackable, hanya yang ber-priority tertinggi
 *    di antara non-stackable yang diterapkan.
 *  - Jika semua stackable, semua diterapkan berurutan (compounding).
 *  - Nominal diskon di-cap agar tidak melebihi base.
 */

import {
  isDiscountActive,
  computeDiscountAmount,
  DISCOUNT_SCOPE,
} from '../models/discount.js';

/**
 * Filter diskon yang aktif pada waktu tertentu dan cocok untuk scope tertentu.
 * @param {import('../core/schema.js').Discount[]} discounts
 * @param {{ scope: 'product'|'category'|'customer'|'sale', targetId?: string, ts?: number }} opts
 * @returns {import('../core/schema.js').Discount[]}
 */
export function filterByScope(discounts, { scope, targetId = '', ts = Date.now() }) {
  return (discounts || []).filter((d) =>
    d.scope === scope &&
    (targetId === '' || d.targetId === '') &&
    // targetId === '' artinya diskon generik untuk scope tsb
    (d.targetId === '' || d.targetId === targetId) &&
    isDiscountActive(d, ts)
  );
}

/**
 * Kandidat diskon untuk satu baris produk.
 * Scope yang dicek: 'product' (targetId = product.id), 'category' (targetId = product.category).
 * Syarat minQty dan minSubtotal harus terpenuhi.
 *
 * @param {import('../core/schema.js').Product} product
 * @param {number} qty
 * @param {number} subtotal
 * @param {import('../core/schema.js').Discount[]} discounts
 * @param {number} [ts]
 * @returns {import('../core/schema.js').Discount[]}
 */
export function matchLineDiscounts(product, qty, subtotal, discounts, ts = Date.now()) {
  return (discounts || []).filter((d) => {
    if (!isDiscountActive(d, ts)) return false;
    if (d.scope === DISCOUNT_SCOPE.PRODUCT && d.targetId !== product.id) return false;
    if (d.scope === DISCOUNT_SCOPE.CATEGORY && d.targetId !== product.category) return false;
    if (d.scope !== DISCOUNT_SCOPE.PRODUCT && d.scope !== DISCOUNT_SCOPE.CATEGORY) return false;
    if (d.minQty > 0 && qty < d.minQty) return false;
    if (d.minSubtotal > 0 && subtotal < d.minSubtotal) return false;
    return true;
  });
}

/**
 * Kandidat diskon level nota.
 * Scope yang dicek: 'customer' (targetId = customerId), 'sale' (generik atau targetId='').
 *
 * @param {string|null} customerId
 * @param {number} baseAmount  nilai dasar (subtotal setelah diskon baris)
 * @param {number} totalQty    jumlah item (untuk minQty)
 * @param {import('../core/schema.js').Discount[]} discounts
 * @param {number} [ts]
 * @returns {import('../core/schema.js').Discount[]}
 */
export function matchSaleDiscounts(customerId, baseAmount, totalQty, discounts, ts = Date.now()) {
  return (discounts || []).filter((d) => {
    if (!isDiscountActive(d, ts)) return false;
    if (d.scope === DISCOUNT_SCOPE.CUSTOMER) {
      if (!customerId || d.targetId !== customerId) return false;
    } else if (d.scope === DISCOUNT_SCOPE.SALE) {
      if (d.targetId && d.targetId !== '') return false; // hanya yang generik
    } else {
      return false;
    }
    if (d.minQty > 0 && totalQty < d.minQty) return false;
    if (d.minSubtotal > 0 && baseAmount < d.minSubtotal) return false;
    return true;
  });
}

/**
 * Terapkan kandidat diskon ke baseAmount secara stacking.
 * Mengembalikan nominal total dan id diskon yang dipakai.
 *
 * @param {import('../core/schema.js').Discount[]} candidates
 * @param {number} baseAmount
 * @returns {{ amount: number, appliedIds: string[] }}
 */
export function computeStackedDiscount(candidates, baseAmount) {
  if (!candidates || candidates.length === 0 || baseAmount <= 0) {
    return { amount: 0, appliedIds: [] };
  }

  const sorted = [...candidates].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const nonStackable = sorted.filter((d) => d.stackable === false);

  /** @type {import('../core/schema.js').Discount[]} */
  let toApply;
  if (nonStackable.length > 0) {
    // Hanya pakai satu non-stackable berprioritas tertinggi.
    toApply = [nonStackable[0]];
  } else {
    toApply = sorted.filter((d) => d.stackable !== false);
  }

  let running = baseAmount;
  let total = 0;
  /** @type {string[]} */
  const appliedIds = [];

  for (const d of toApply) {
    if (running <= 0) break;
    const amt = computeDiscountAmount(d, running);
    if (amt <= 0) continue;
    running -= amt;
    total += amt;
    appliedIds.push(d.id);
  }

  // Jaga-jaga, nominal tidak boleh > base.
  return { amount: Math.min(total, baseAmount), appliedIds };
}