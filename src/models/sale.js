/**
 * src/models/sale.js
 * Model nota + FEFO tracking + serial tracking.
 */

import { PAYMENT_METHOD } from './payment.js';

export const SALE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PAID: 'paid',
  VOID: 'void',
  RETURNED: 'returned',
});

export const SALE_DEFAULTS = /** @type {Sale} */ ({
  id: '',
  number: '',
  status: 'paid',
  cashierId: '',
  shiftId: '',
  customerId: null,
  items: [],
  payments: [],
  subtotal: 0,
  extraDiscount: 0,
  discountTotal: 0,
  taxTotal: 0,
  total: 0,
  paidTotal: 0,
  change: 0,
  debtAmount: 0,
  note: '',
  isDebtPayment: false,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

export function createSale(input = {}) {
  const s = { ...SALE_DEFAULTS, ...input };
  s.items = Array.isArray(s.items) ? s.items.map(createSaleItem) : [];
  s.payments = Array.isArray(s.payments) ? s.payments.map((p) => ({ ...p })) : [];
  return s;
}

/**
 * @typedef {Object} BatchAllocation
 * @property {string} batchId
 * @property {string} batchNumber
 * @property {number} expiryDate
 * @property {number} qty   (dalam base unit)
 */

export function createSaleItem(input = {}) {
  return {
    productId: '',
    unitId: '',
    productName: '',
    unitName: '',
    factor: 1,
    qty: 0,
    pricePerUnit: 0,
    subtotal: 0,
    discountAmount: 0,
    total: 0,
    note: '',
    trackSerial: false,
    serials: [],
    trackExpiry: false,
    batchAllocations: [],
    ...input,
  };
}

export function calcTotals(sale) {
  if (sale.isDebtPayment) {
    sale.subtotal = 0;
    sale.extraDiscount = 0;
    sale.discountTotal = 0;
    sale.taxTotal = 0;
    let nonCredit = 0;
    let creditSum = 0;
    for (const p of sale.payments) {
      const amt = Math.max(0, Math.round(p.amount || 0));
      if (p.method === PAYMENT_METHOD.CREDIT) creditSum += amt;
      else nonCredit += amt;
    }
    sale.total = nonCredit + creditSum;
    sale.paidTotal = nonCredit;
    sale.change = 0;
    sale.debtAmount = 0;
    return sale;
  }

  let subtotal = 0;
  let discountLines = 0;

  for (const it of sale.items) {
    const lineSub = Math.max(0, Math.round((Number(it.qty) || 0) * (Number(it.pricePerUnit) || 0)));
    it.subtotal = lineSub;
    const lineDisc = Math.min(lineSub, Math.max(0, Math.round(it.discountAmount || 0)));
    it.discountAmount = lineDisc;
    it.total = lineSub - lineDisc;
    subtotal += lineSub;
    discountLines += lineDisc;
  }

  sale.subtotal = subtotal;

  const extraMax = Math.max(0, subtotal - discountLines);
  sale.extraDiscount = Math.min(extraMax, Math.max(0, Math.round(sale.extraDiscount || 0)));
  sale.discountTotal = discountLines + sale.extraDiscount;
  sale.taxTotal = Math.max(0, Math.round(sale.taxTotal || 0));
  sale.total = Math.max(0, subtotal - sale.discountTotal + sale.taxTotal);

  let nonCredit = 0;
  let creditSum = 0;
  for (const p of sale.payments) {
    const amt = Math.max(0, Math.round(p.amount || 0));
    if (p.method === PAYMENT_METHOD.CREDIT) creditSum += amt;
    else nonCredit += amt;
  }

  const remaining = sale.total - nonCredit;
  sale.change = Math.max(0, -remaining);
  sale.debtAmount = remaining > 0 ? Math.min(remaining, creditSum) : 0;
  sale.paidTotal = nonCredit;

  return sale;
}

export function validateSale(sale) {
  if (!sale.number) throw new Error('Nomor transaksi kosong');
  if (!sale.isDebtPayment && !sale.items.length) throw new Error('Keranjang kosong');

  for (const it of sale.items) {
    if (!it.productId) throw new Error('Baris tanpa produk');
    if (it.qty <= 0) throw new Error('Qty harus > 0');
    if (it.pricePerUnit < 0) throw new Error('Harga tidak boleh negatif');

    if (it.trackSerial) {
      const serials = it.serials || [];
      if (serials.length !== it.qty) {
        throw new Error(
          `Jumlah serial "${it.productName}" tidak sesuai. Qty ${it.qty}, serial ${serials.length}.`
        );
      }
      if (new Set(serials).size !== serials.length) {
        throw new Error(`Ada serial duplikat di "${it.productName}"`);
      }
    }
  }

  if (sale.status === SALE_STATUS.PAID && !sale.isDebtPayment) {
    const covered = sale.paidTotal + sale.debtAmount;
    if (covered < sale.total) {
      throw new Error('Total pembayaran kurang dari total nota');
    }
  }
  return true;
}