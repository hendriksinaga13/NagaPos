/**
 * src/models/discount.js
 */

/**
 * @typedef {import('../core/schema.js').Discount} Discount
 */

export const DISCOUNT_SCOPE = Object.freeze({
  PRODUCT: 'product',
  CATEGORY: 'category',
  CUSTOMER: 'customer',
  SALE: 'sale',
});

export const DISCOUNT_TYPE = Object.freeze({
  PERCENT: 'percent',
  NOMINAL: 'nominal',
});

export const DISCOUNT_DEFAULTS = /** @type {Discount} */ ({
  id: '',
  name: '',
  scope: 'sale',
  targetId: '',
  type: 'percent',
  value: 0,
  priority: 0,
  minQty: 0,
  minSubtotal: 0,
  validFrom: null,
  validTo: null,
  active: true,
  stackable: true,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

/** @param {Partial<Discount>} [input] @returns {Discount} */
export function createDiscount(input = {}) {
  return { ...DISCOUNT_DEFAULTS, ...input };
}

/** @param {Discount} d */
export function validateDiscount(d) {
  if (!d.name || !String(d.name).trim()) throw new Error('Nama diskon wajib diisi');
  if (!Object.values(DISCOUNT_SCOPE).includes(d.scope)) throw new Error('Scope diskon tidak valid');
  if (!Object.values(DISCOUNT_TYPE).includes(d.type)) throw new Error('Tipe diskon tidak valid');
  if (!Number.isFinite(d.value) || d.value < 0) throw new Error('Nilai diskon tidak valid');
  if (d.type === DISCOUNT_TYPE.PERCENT && d.value > 100) {
    throw new Error('Diskon persen maksimal 100');
  }
  if (d.validFrom && d.validTo && d.validFrom > d.validTo) {
    throw new Error('Tanggal berlaku tidak wajar');
  }
  return true;
}

/**
 * Apakah diskon aktif pada waktu tertentu?
 * @param {Discount} d
 * @param {number} [ts]
 */
export function isDiscountActive(d, ts = Date.now()) {
  if (!d.active || d.deleted) return false;
  if (d.validFrom && ts < d.validFrom) return false;
  if (d.validTo && ts > d.validTo) return false;
  return true;
}

/**
 * Hitung nominal diskon untuk basis nilai tertentu (tanpa cap min-qty/subtotal).
 * @param {Discount} d
 * @param {number} baseAmount
 */
export function computeDiscountAmount(d, baseAmount) {
  if (baseAmount <= 0) return 0;
  if (d.type === DISCOUNT_TYPE.PERCENT) {
    return Math.round((baseAmount * d.value) / 100);
  }
  return Math.min(Math.round(d.value), baseAmount);
}