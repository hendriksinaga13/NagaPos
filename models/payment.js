/**
 * src/models/payment.js
 * Metode pembayaran + helper. Payment adalah objek yang disimpan
 * embedded di `sale.payments[]`.
 */

/**
 * @typedef {import('../core/schema.js').Payment} Payment
 */

export const PAYMENT_METHOD = Object.freeze({
  CASH: 'cash',
  QRIS: 'qris',
  TRANSFER: 'transfer',
  DEBIT: 'debit',
  CREDIT: 'credit',
});

export const PAYMENT_LABEL = Object.freeze({
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Kartu Debit',
  credit: 'Utang / Kredit',
});

/** @param {Partial<Payment>} [input] @returns {Payment} */
export function createPayment(input = {}) {
  return {
    method: PAYMENT_METHOD.CASH,
    amount: 0,
    ref: '',
    paidAt: Date.now(),
    ...input,
  };
}

/** @param {Payment} p */
export function validatePayment(p) {
  if (!Object.values(PAYMENT_METHOD).includes(p.method)) {
    throw new Error('Metode pembayaran tidak dikenal');
  }
  if (!Number.isFinite(p.amount) || p.amount < 0) {
    throw new Error('Nominal pembayaran tidak valid');
  }
  return true;
}

/** Apakah metode ini mengurangi piutang (bukan menambah)? */
export function isCashLike(method) {
  return method !== PAYMENT_METHOD.CREDIT;
}