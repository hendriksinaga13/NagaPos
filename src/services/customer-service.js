/**
 * src/services/customer-service.js
 * Operasi pelanggan: pembayaran piutang, riwayat belanja, riwayat piutang.
 */

import { PAYMENT_METHOD } from '../models/payment.js';

/**
 * Ambil riwayat belanja pelanggan (exclude pembayaran piutang).
 * @param {object} ctx
 * @param {string} customerId
 * @param {number} [limit]
 * @returns {Promise<import('../core/schema.js').Sale[]>}
 */
export async function getCustomerSales(ctx, customerId, limit = 30) {
  const sales = await ctx.repos.sales.listByIndex('by_customer', customerId);
  return sales
    .filter((s) => !s.isDebtPayment)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Riwayat piutang: gabungan charge (debtAmount > 0) dan payment (isDebtPayment).
 * Diurutkan dari yang terbaru.
 * @param {object} ctx
 * @param {string} customerId
 * @returns {Promise<Array<{ sale: any, kind: 'charge'|'payment', amount: number, at: number, balance: number }>>}
 */
export async function getDebtLedger(ctx, customerId) {
  const sales = await ctx.repos.sales.listByIndex('by_customer', customerId);
  const entries = [];

  for (const s of sales) {
    if (s.status === 'void' || s.deleted) continue;
    if (s.isDebtPayment) {
      // Pembayaran piutang = pengurang.
      const amount = s.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      entries.push({ sale: s, kind: 'payment', amount, at: s.createdAt });
    } else if (s.debtAmount > 0) {
      entries.push({ sale: s, kind: 'charge', amount: s.debtAmount, at: s.createdAt });
    }
  }

  entries.sort((a, b) => a.at - b.at);

  // Hitung saldo berjalan dari 0.
  let balance = 0;
  for (const e of entries) {
    if (e.kind === 'charge') balance += e.amount;
    else balance -= e.amount;
    e.balance = balance;
  }
  // Tampilkan terbaru di atas.
  return entries.reverse();
}

/**
 * Bayar piutang pelanggan. Membuat sale pembayaran yang muncul di riwayat.
 * @param {object} ctx
 * @param {string} customerId
 * @param {number} amount
 * @param {string} method   cash|qris|transfer|debit
 * @param {string} [ref]
 * @param {string} [cashierId]
 * @param {string} [shiftId]
 * @returns {Promise<import('../core/schema.js').Sale>}
 */
export async function payCustomerDebt(ctx, customerId, amount, method, ref = '', cashierId = 'kasir', shiftId = '') {
  if (!Object.values(PAYMENT_METHOD).includes(method) || method === PAYMENT_METHOD.CREDIT) {
    throw new Error('Metode pembayaran piutang tidak valid');
  }
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Nominal harus lebih dari 0');

  const customer = await ctx.repos.customers.get(customerId);
  if (!customer) throw new Error('Pelanggan tidak ditemukan');
  if (customer.debt <= 0) throw new Error('Pelanggan tidak punya utang');
  if (amt > customer.debt) throw new Error('Nominal melebihi sisa utang');

  const { recordDebtPayment } = await import('./sale-service.js');
  return recordDebtPayment(ctx, {
    customerId, amount: amt, method, ref, cashierId, shiftId,
  });
}