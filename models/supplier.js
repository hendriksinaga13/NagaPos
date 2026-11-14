/**
 * src/models/supplier.js
 */

/**
 * @typedef {import('../core/schema.js').Supplier} Supplier
 */

export const SUPPLIER_DEFAULTS = /** @type {Supplier} */ ({
  id: '',
  name: '',
  phone: '',
  address: '',
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

/** @param {Partial<Supplier>} [input] @returns {Supplier} */
export function createSupplier(input = {}) {
  return { ...SUPPLIER_DEFAULTS, ...input };
}

/** @param {Supplier} s */
export function validateSupplier(s) {
  if (!s.name || !String(s.name).trim()) throw new Error('Nama supplier wajib diisi');
  return true;
}