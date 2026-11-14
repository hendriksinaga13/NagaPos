/**
 * src/services/payment-service.js
 * Helper pembayaran: validasi, hitung kembalian, sisa piutang, saran nominal.
 */

import { PAYMENT_METHOD, PAYMENT_LABEL, isCashLike } from '../models/payment.js';

/**
 * Jumlahkan pembayaran per kategori.
 * @param {import('../core/schema.js').Payment[]} payments
 * @returns {{ nonCredit: number, credit: number, total: number }}
 */
export function sumPayments(payments) {
  let nonCredit = 0;
  let credit = 0;
  for (const p of payments || []) {
    const amt = Math.max(0, Math.round(p.amount || 0));
    if (p.method === PAYMENT_METHOD.CREDIT) credit += amt;
    else if (isCashLike(p.method)) nonCredit += amt;
  }
  return { nonCredit, credit, total: nonCredit + credit };
}

/**
 * Validasi satu pembayaran.
 * @param {import('../core/schema.js').Payment} p
 * @throws {Error}
 */
export function validatePayment(p) {
  if (!p || typeof p !== 'object') throw new Error('Pembayaran tidak valid');
  if (!Object.values(PAYMENT_METHOD).includes(p.method)) {
    throw new Error('Metode pembayaran tidak dikenal');
  }
  if (!Number.isFinite(p.amount) || p.amount < 0) {
    throw new Error('Nominal pembayaran tidak valid');
  }
}

/**
 * Apakah semua pembayaran menutup total nota?
 * Kembalian (jika ada) tidak dihitung sebagai bagian pembayaran.
 * @param {number} total
 * @param {import('../core/schema.js').Payment[]} payments
 */
export function isSaleCovered(total, payments) {
  const { total: sum } = sumPayments(payments);
  return sum >= total;
}

/**
 * Kembalian = kelebihan pembayaran non-kredit di atas total.
 * @param {number} total
 * @param {import('../core/schema.js').Payment[]} payments
 */
export function computeChange(total, payments) {
  const { nonCredit } = sumPayments(payments);
  return Math.max(0, nonCredit - total);
}

/**
 * Sisa piutang yang timbul dari pembayaran kredit, dibatasi sisa tagihan.
 * @param {number} total
 * @param {import('../core/schema.js').Payment[]} payments
 */
export function computeDebt(total, payments) {
  const { nonCredit, credit } = sumPayments(payments);
  const remaining = Math.max(0, total - nonCredit);
  return Math.min(remaining, credit);
}

/**
 * Label tampilan untuk metode.
 * @param {string} method
 */
export function paymentLabel(method) {
  return PAYMENT_LABEL[method] || method;
}

/**
 * Saran nominal tunai cepat berdasarkan total.
 * Selalu sertakan pas, lalu pembulatan umum (5rb, 10rb, 20rb, 50rb, 100rb).
 * @param {number} total
 * @returns {number[]} unik, urut naik, tidak melebihi total*10
 */
export function suggestCashAmounts(total) {
  const t = Math.max(0, Math.round(total));
  /** @type {Set<number>} */
  const s = new Set([t]);

  const steps = [1000, 5000, 10000, 20000, 50000, 100000];
  for (const step of steps) {
    const rounded = Math.ceil(t / step) * step;
    if (rounded >= t && rounded > 0) s.add(rounded);
  }
  // Uang yang biasa di tangan pembeli: pembulatan ke atas + kelipatan.
  s.add(50000);
  s.add(100000);

  return [...s].filter((v) => v >= t && v <= Math.max(t * 10, 100000)).sort((a, b) => a - b);
}