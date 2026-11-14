/**
 * src/models/customer.js
 */

/**
 * @typedef {import('../core/schema.js').Customer} Customer
 */

export const CUSTOMER_DEFAULTS = /** @type {Customer} */ ({
  id: '',
  name: '',
  phone: '',
  address: '',
  priceLevel: 'retail',
  discountPercent: 0,
  creditLimit: 0,
  debt: 0,
  notes: '',
  barcode: '', // <-- BARU
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

/** @param {Partial<Customer>} [input] @returns {Customer} */
export function createCustomer(input = {}) {
  return { ...CUSTOMER_DEFAULTS, ...input };
}

/** @param {Customer} c */
export function validateCustomer(c) {
  if (!c.name || !String(c.name).trim()) throw new Error('Nama pelanggan wajib diisi');
  if (!Number.isFinite(c.discountPercent) || c.discountPercent < 0 || c.discountPercent > 100) {
    throw new Error('Diskon pelanggan harus 0..100');
  }
  if (!Number.isFinite(c.creditLimit) || c.creditLimit < 0) {
    throw new Error('Plafon utang tidak valid');
  }
  return true;
}

/** Pelanggan boleh utang lagi dengan nominal tertentu? */
export function canIncurDebt(c, additionalAmount) {
  if (additionalAmount <= 0) return true;
  if (c.creditLimit <= 0) return false;
  return c.debt + additionalAmount <= c.creditLimit;
}