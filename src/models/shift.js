/**
 * src/models/shift.js
 */

/**
 * @typedef {import('../core/schema.js').Shift} Shift
 */

export const SHIFT_STATUS = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
});

export const SHIFT_DEFAULTS = /** @type {Shift} */ ({
  id: '',
  cashierId: '',
  status: 'open',
  openingCash: 0,
  closingCash: null,
  expectedCash: null,
  difference: 0,
  openedAt: 0,
  closedAt: null,
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

/** @param {Partial<Shift>} [input] @returns {Shift} */
export function createShift(input = {}) {
  const s = { ...SHIFT_DEFAULTS, ...input };
  if (!s.openedAt) s.openedAt = Date.now();
  return s;
}

/** @param {Shift} s */
export function validateShift(s) {
  if (!s.cashierId) throw new Error('Shift tanpa kasir');
  if (!Object.values(SHIFT_STATUS).includes(s.status)) throw new Error('Status shift tidak valid');
  if (!Number.isFinite(s.openingCash) || s.openingCash < 0) {
    throw new Error('Modal awal tidak valid');
  }
  return true;
}