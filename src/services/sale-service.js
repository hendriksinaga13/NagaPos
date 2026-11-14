/**
 * src/services/sale-service.js
 * Finalisasi sale dengan FEFO deduction + serial tracking.
 */

import { newId, nextDocNumber } from '../core/id.js';
import { idbReq } from '../core/db.js';
import { createSale, calcTotals, validateSale, SALE_STATUS } from '../models/sale.js';
import { canIncurDebt } from '../models/customer.js';
import { PAYMENT_METHOD, createPayment } from '../models/payment.js';
import { logAudit } from './audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';
import { markSerialsSold, markSerialsInStock } from './serial-service.js';
import {
  deductFEFOInTx, restoreFEFOInTx, restorePartialFEFOInTx,
  listBatchesByProduct,
} from './batch-service.js';

/* ===================== FINALIZE ===================== */

export async function finalizeSale(draft, ctx, opts = {}) {
  const { db, repos } = ctx;
  const now = Date.now();

  const number = await nextDocNumber(db, { prefix: 'INV', kind: 'sale' });

  const sale = createSale({
    ...draft,
    id: newId(),
    number,
    status: SALE_STATUS.PAID,
    cashierId: opts.cashierId || draft.cashierId || 'kasir',
    shiftId: opts.shiftId || draft.shiftId || '',
    note: opts.note || draft.note || '',
    createdAt: now,
    updatedAt: now,
  });
  calcTotals(sale);
  validateSale(sale);

  let customer = null;
  if (sale.customerId) {
    customer = (await repos.customers.get(sale.customerId)) || null;
    if (!customer) throw new Error('Pelanggan tidak ditemukan');
    if (sale.debtAmount > 0 && !canIncurDebt(customer, sale.debtAmount)) {
      throw new Error(`Melebihi plafon utang pelanggan (sisa: Rp ${customer.creditLimit - customer.debt})`);
    }
  }

  const productMap = new Map();
  for (const it of sale.items) {
    if (!productMap.has(it.productId)) {
      const p = await repos.products.get(it.productId);
      if (!p) throw new Error(`Produk ${it.productId} tidak ditemukan`);
      productMap.set(it.productId, p);
    }
  }

  // PRE-CHECK batch availability
  for (const it of sale.items) {
    const product = productMap.get(it.productId);
    if (product?.trackExpiry) {
      const qtyBase = it.qty * it.factor;
      const batches = await listBatchesByProduct(ctx, it.productId, true);
      const totalActive = batches.reduce((sum, b) => sum + b.qtyBase, 0);
      if (totalActive < qtyBase) {
        throw new Error(
          `Stok batch "${it.productName}" tidak cukup. Butuh ${qtyBase}, tersedia ${totalActive}.`
        );
      }
    }
  }

  await db.withTransaction(
    ['sales', 'stockMovements', 'products', 'customers', 'batches'],
    'readwrite',
    async (tx) => {
      const salesStore = tx.objectStore('sales');
      const movStore = tx.objectStore('stockMovements');
      const productStore = tx.objectStore('products');
      const customerStore = tx.objectStore('customers');

      // 1. FEFO deductions FIRST (sebelum sale disimpan agar batchAllocations bisa di-embed)
      for (const it of sale.items) {
        const product = productMap.get(it.productId);
        if (product?.trackExpiry) {
          const qtyBase = it.qty * it.factor;
          const allocations = await deductFEFOInTx(tx, it.productId, qtyBase);
          it.batchAllocations = allocations;
        }
      }

      // 2. Save sale WITH batch allocations embedded
      await idbReq(salesStore.put(sale));

      // 3. Stock movements
      const runningStock = new Map();
      for (const [pid, p] of productMap) runningStock.set(pid, Number(p.stock) || 0);

      for (const it of sale.items) {
        const baseQty = it.qty * it.factor;
        const before = runningStock.get(it.productId) || 0;
        const after = before - baseQty;
        runningStock.set(it.productId, after);

        await idbReq(movStore.put({
          id: newId(),
          productId: it.productId,
          unitId: it.unitId,
          type: 'out',
          qty: it.qty,
          factor: it.factor,
          qtyBase: -baseQty,
          stockAfter: after,
          refType: 'sale',
          refId: sale.id,
          notes: `Penjualan ${sale.number}`,
          createdAt: now, updatedAt: now, deleted: false,
        }));
      }

      // 4. Update product stocks
      for (const [pid, after] of runningStock) {
        const p = productMap.get(pid);
        if (!p) continue;
        await idbReq(productStore.put({ ...p, stock: after, updatedAt: now }));
      }

      // 5. Customer debt
      if (customer && sale.debtAmount > 0) {
        await idbReq(customerStore.put({
          ...customer,
          debt: (Number(customer.debt) || 0) + sale.debtAmount,
          updatedAt: now,
        }));
      }
    },
  );

  // Mark serials
  try {
    for (const it of sale.items) {
      if (!it.trackSerial || !it.serials || it.serials.length === 0) continue;
      const product = productMap.get(it.productId);
      const serialIds = [];
      for (const serialStr of it.serials) {
        const s = await ctx.repos.serialNumbers.findByIndex('by_serial', serialStr);
        if (s && s.status === 'in_stock') serialIds.push(s.id);
      }
      if (serialIds.length > 0) {
        await markSerialsSold(ctx, serialIds, {
          saleId: sale.id,
          soldAt: now,
          soldPrice: it.pricePerUnit,
          customerId: sale.customerId,
          customerName: customer?.name || '',
          warrantyMonths: product?.warrantyMonths || 0,
        });
      }
    }
  } catch (e) { console.error('[sale] mark serials gagal:', e); }

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SALE_CREATE,
    details: {
      number: sale.number,
      total: sale.total,
      itemCount: sale.items.length,
      customerName: customer?.name || '',
      debtAmount: sale.debtAmount,
      change: sale.change,
    },
  });

  return sale;
}

/* ===================== VOID ===================== */

export async function voidSale(saleId, ctx, opts = {}) {
  const { db, repos } = ctx;
  const sale = await repos.sales.get(saleId);
  if (!sale) throw new Error('Transaksi tidak ditemukan');
  if (sale.status === SALE_STATUS.VOID) throw new Error('Transaksi sudah di-void');
  if (sale.status === SALE_STATUS.RETURNED) throw new Error('Transaksi sudah diretur');
  if (sale.status !== SALE_STATUS.PAID) throw new Error('Hanya transaksi lunas yang bisa di-void');
  if (sale.isDebtPayment) throw new Error('Pembayaran piutang tidak bisa di-void. Gunakan retur.');

  const now = Date.now();
  const reason = (opts.reason || '').trim();

  const productMap = new Map();
  for (const it of sale.items) {
    if (!productMap.has(it.productId)) {
      const p = await repos.products.get(it.productId);
      if (p) productMap.set(it.productId, p);
    }
  }

  const customer = sale.customerId ? await repos.customers.get(sale.customerId) : null;

  await db.withTransaction(
    ['sales', 'stockMovements', 'products', 'customers', 'batches'],
    'readwrite',
    async (tx) => {
      const salesStore = tx.objectStore('sales');
      const movStore = tx.objectStore('stockMovements');
      const productStore = tx.objectStore('products');
      const customerStore = tx.objectStore('customers');

      await idbReq(salesStore.put({
        ...sale,
        status: SALE_STATUS.VOID,
        voidReason: reason,
        voidedAt: now,
        updatedAt: now,
      }));

      // Restore batches
      for (const it of sale.items) {
        if (it.batchAllocations && it.batchAllocations.length > 0) {
          await restoreFEFOInTx(tx, it.batchAllocations);
        }
      }

      // Restore stocks
      const runningStock = new Map();
      for (const [pid, p] of productMap) runningStock.set(pid, Number(p.stock) || 0);

      for (const it of sale.items) {
        const baseQty = it.qty * it.factor;
        const before = runningStock.get(it.productId) || 0;
        const after = before + baseQty;
        runningStock.set(it.productId, after);

        await idbReq(movStore.put({
          id: newId(),
          productId: it.productId,
          unitId: it.unitId,
          type: 'void',
          qty: it.qty,
          factor: it.factor,
          qtyBase: baseQty,
          stockAfter: after,
          refType: 'sale',
          refId: sale.id,
          notes: `Void ${sale.number}${reason ? ': ' + reason : ''}`,
          createdAt: now, updatedAt: now, deleted: false,
        }));
      }

      for (const [pid, after] of runningStock) {
        const p = productMap.get(pid);
        if (!p) continue;
        await idbReq(productStore.put({ ...p, stock: after, updatedAt: now }));
      }

      if (customer && sale.debtAmount > 0) {
        await idbReq(customerStore.put({
          ...customer,
          debt: Math.max(0, (Number(customer.debt) || 0) - sale.debtAmount),
          updatedAt: now,
        }));
      }
    },
  );

  try {
    const serialsInSale = await ctx.repos.serialNumbers.listByIndex('by_sale', sale.id);
    if (serialsInSale.length > 0) {
      await markSerialsInStock(ctx, serialsInSale.map((s) => s.id), `Void ${sale.number}`);
    }
  } catch (e) { console.warn('[void] reset serials gagal:', e); }

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SALE_VOID,
    details: { number: sale.number, total: sale.total, reason: reason || '-', itemCount: sale.items.length },
  });

  return { success: true };
}

/* ===================== RETUR ===================== */

export async function returnItems(saleId, returnLines, ctx, opts = {}) {
  const { db, repos } = ctx;
  const sale = await repos.sales.get(saleId);
  if (!sale) throw new Error('Transaksi tidak ditemukan');
  if (sale.status !== SALE_STATUS.PAID) throw new Error('Hanya nota lunas yang bisa diretur');
  if (sale.isDebtPayment) throw new Error('Pembayaran piutang bukan nota barang');
  if (!Array.isArray(returnLines) || returnLines.length === 0) {
    throw new Error('Tidak ada item yang diretur');
  }

  const now = Date.now();
  const reason = (opts.reason || 'Retur').trim();

  for (const rl of returnLines) {
    const item = sale.items[rl.lineIndex];
    if (!item) throw new Error(`Baris ${rl.lineIndex} tidak ditemukan`);
    if (!(rl.qty > 0) || rl.qty > item.qty) throw new Error(`Qty retur baris ${rl.lineIndex} tidak valid`);
  }

  let refundAmount = 0;
  for (const rl of returnLines) {
    const item = sale.items[rl.lineIndex];
    const ratio = rl.qty / item.qty;
    refundAmount += Math.round(item.total * ratio);
  }
  refundAmount = Math.max(0, refundAmount);

  const customer = sale.customerId ? await repos.customers.get(sale.customerId) : null;
  const debtReduction = customer && sale.debtAmount > 0 ? Math.min(refundAmount, Number(customer.debt) || 0) : 0;
  const cashRefund = refundAmount - debtReduction;

  const productMap = new Map();
  for (const rl of returnLines) {
    const item = sale.items[rl.lineIndex];
    if (!productMap.has(item.productId)) {
      const p = await repos.products.get(item.productId);
      if (p) productMap.set(item.productId, p);
    }
  }

  await db.withTransaction(
    ['stockMovements', 'products', 'customers', 'batches'],
    'readwrite',
    async (tx) => {
      const movStore = tx.objectStore('stockMovements');
      const productStore = tx.objectStore('products');
      const customerStore = tx.objectStore('customers');

      const runningStock = new Map();
      for (const [pid, p] of productMap) runningStock.set(pid, Number(p.stock) || 0);

      for (const rl of returnLines) {
        const item = sale.items[rl.lineIndex];

        // Restore batch (proportional)
        if (item.batchAllocations && item.batchAllocations.length > 0) {
          const qtyBaseToRestore = rl.qty * item.factor;
          await restorePartialFEFOInTx(tx, item.batchAllocations, qtyBaseToRestore);
        }

        const baseQty = rl.qty * item.factor;
        const before = runningStock.get(item.productId) || 0;
        const after = before + baseQty;
        runningStock.set(item.productId, after);

        await idbReq(movStore.put({
          id: newId(),
          productId: item.productId,
          unitId: item.unitId,
          type: 'return',
          qty: rl.qty,
          factor: item.factor,
          qtyBase: baseQty,
          stockAfter: after,
          refType: 'return',
          refId: sale.id,
          notes: `${reason} — nota ${sale.number}`,
          createdAt: now, updatedAt: now, deleted: false,
        }));
      }

      for (const [pid, after] of runningStock) {
        const p = productMap.get(pid);
        if (!p) continue;
        await idbReq(productStore.put({ ...p, stock: after, updatedAt: now }));
      }

      if (customer && debtReduction > 0) {
        await idbReq(customerStore.put({
          ...customer,
          debt: Math.max(0, (Number(customer.debt) || 0) - debtReduction),
          updatedAt: now,
        }));
      }
    },
  );

  try {
    const serialsInSale = await ctx.repos.serialNumbers.listByIndex('by_sale', sale.id);
    const { SERIAL_STATUS } = await import('../models/serial-number.js');
    for (const rl of returnLines) {
      const item = sale.items[rl.lineIndex];
      if (!item.trackSerial || !item.serials) continue;
      const lineSerials = serialsInSale.filter((s) => item.serials.includes(s.serial) && s.status === SERIAL_STATUS.SOLD);
      const toReturn = lineSerials.slice(0, rl.qty);
      for (const s of toReturn) {
        await ctx.repos.serialNumbers.patch(s.id, {
          status: SERIAL_STATUS.RETURNED,
          notes: (s.notes || '') + ` [Retur ${sale.number}${reason ? ': ' + reason : ''}]`,
        });
      }
    }
  } catch (e) { console.warn('[return] mark serials gagal:', e); }

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SALE_RETURN,
    details: { number: sale.number, refundAmount, debtReduction, cashRefund, lineCount: returnLines.length, reason },
  });

  return { refundAmount, debtReduction, cashRefund };
}

/* ===================== DEBT PAYMENT ===================== */

export async function recordDebtPayment(ctx, opts) {
  const { db, repos } = ctx;
  const customer = await repos.customers.get(opts.customerId);
  if (!customer) throw new Error('Pelanggan tidak ditemukan');

  const amount = Math.round(Number(opts.amount) || 0);
  if (amount <= 0) throw new Error('Nominal tidak valid');
  if (amount > customer.debt) throw new Error('Nominal melebihi sisa utang');
  if (![PAYMENT_METHOD.CASH, PAYMENT_METHOD.QRIS, PAYMENT_METHOD.TRANSFER, PAYMENT_METHOD.DEBIT].includes(opts.method)) {
    throw new Error('Metode pembayaran tidak valid untuk piutang');
  }

  const number = await nextDocNumber(db, { prefix: 'PAY', kind: 'debtpayment' });
  const now = Date.now();

  const sale = createSale({
    id: newId(), number, status: SALE_STATUS.PAID,
    cashierId: opts.cashierId || 'kasir', shiftId: opts.shiftId || '',
    customerId: opts.customerId, items: [],
    payments: [createPayment({ method: opts.method, amount, ref: opts.ref || '', paidAt: now })],
    subtotal: 0, extraDiscount: 0, discountTotal: 0, taxTotal: 0,
    total: amount, note: 'Pembayaran piutang', isDebtPayment: true,
    createdAt: now, updatedAt: now,
  });
  calcTotals(sale);

  await db.withTransaction(['sales', 'customers'], 'readwrite', async (tx) => {
    await idbReq(tx.objectStore('sales').put(sale));
    await idbReq(tx.objectStore('customers').put({
      ...customer,
      debt: Math.max(0, (Number(customer.debt) || 0) - amount),
      updatedAt: now,
    }));
  });

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.DEBT_PAYMENT,
    details: { customerId: opts.customerId, customerName: customer.name, amount, method: opts.method },
  });

  return sale;
}