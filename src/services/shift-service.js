/**
 * src/services/shift-service.js
 * Buka/tutup shift kasir + ringkasan.
 * Setiap aksi tercatat di audit log.
 */

import { newId } from '../core/id.js';
import { createShift, validateShift, SHIFT_STATUS } from '../models/shift.js';
import { PAYMENT_METHOD } from '../models/payment.js';
import { logAudit } from './audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';

/**
 * @param {object} ctx
 * @returns {Promise<import('../core/schema.js').Shift|null>}
 */
export async function getActiveShift(ctx) {
  const list = await ctx.repos.shifts.listByIndex('by_status', SHIFT_STATUS.OPEN);
  if (!list.length) return null;
  return list.sort((a, b) => b.openedAt - a.openedAt)[0];
}

/**
 * Buka shift baru.
 * @param {object} ctx
 * @param {{ cashierId: string, openingCash: number, notes?: string }} opts
 * @returns {Promise<import('../core/schema.js').Shift>}
 */
export async function openShift(ctx, opts) {
  const existing = await getActiveShift(ctx);
  if (existing) throw new Error('Masih ada shift terbuka. Tutup dulu sebelum membuka baru.');

  const shift = createShift({
    id: newId(),
    cashierId: opts.cashierId || 'kasir',
    status: SHIFT_STATUS.OPEN,
    openingCash: Math.max(0, Math.round(Number(opts.openingCash) || 0)),
    notes: opts.notes || '',
    openedAt: Date.now(),
  });
  validateShift(shift);
  const saved = await ctx.repos.shifts.save(shift);

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SHIFT_OPEN,
    details: {
      openingCash: shift.openingCash,
      cashierId: shift.cashierId,
      notes: shift.notes || '',
    },
  });

  return saved;
}

/**
 * Hitung total penjualan tunai dalam satu shift.
 * @param {object} ctx
 * @param {string} shiftId
 * @returns {Promise<{ cashSales: number, refundCash: number, totalSales: number, countSales: number }>}
 */
export async function computeShiftTotals(ctx, shiftId) {
  const sales = await ctx.repos.sales.listByIndex('by_shift', shiftId);
  let cashSales = 0;
  let refundCash = 0;
  let totalSales = 0;
  let countSales = 0;

  for (const s of sales) {
    if (s.status === 'void' || s.deleted) continue;
    if (s.isDebtPayment) continue;
    countSales += 1;
    totalSales += s.total || 0;
    for (const p of s.payments || []) {
      if (p.method === PAYMENT_METHOD.CASH) cashSales += p.amount || 0;
    }
    refundCash += s.change || 0;
  }

  for (const s of sales) {
    if (s.status === 'void' || s.deleted) continue;
    if (!s.isDebtPayment) continue;
    for (const p of s.payments || []) {
      if (p.method === PAYMENT_METHOD.CASH) cashSales += p.amount || 0;
    }
  }

  return { cashSales, refundCash, totalSales, countSales };
}

/**
 * Tutup shift dan hitung selisih.
 * @param {object} ctx
 * @param {string} shiftId
 * @param {number} closingCash
 * @param {string} [notes]
 * @returns {Promise<import('../core/schema.js').Shift>}
 */
export async function closeShift(ctx, shiftId, closingCash, notes = '') {
  const shift = await ctx.repos.shifts.get(shiftId);
  if (!shift) throw new Error('Shift tidak ditemukan');
  if (shift.status !== SHIFT_STATUS.OPEN) throw new Error('Shift sudah ditutup');

  const totals = await computeShiftTotals(ctx, shiftId);
  const expectedCash = shift.openingCash + totals.cashSales - totals.refundCash;
  const closing = Math.max(0, Math.round(Number(closingCash) || 0));

  const updated = {
    ...shift,
    status: SHIFT_STATUS.CLOSED,
    closingCash: closing,
    expectedCash,
    difference: closing - expectedCash,
    closedAt: Date.now(),
    notes: notes || shift.notes || '',
    updatedAt: Date.now(),
  };
  await ctx.repos.shifts.save(updated);

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SHIFT_CLOSE,
    details: {
      expectedCash,
      closingCash: closing,
      difference: closing - expectedCash,
      cashierId: shift.cashierId,
      countSales: totals.countSales,
    },
  });

  return updated;
}