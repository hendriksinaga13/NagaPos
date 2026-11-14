/**
 * src/models/unit.js
 * Satu produk punya ≥1 unit. Satu unit adalah base (factor=1, isBase=true).
 */

/**
 * @typedef {import('../core/schema.js').Unit} Unit
 */

export const UNIT_DEFAULTS = /** @type {Unit} */ ({
  id: '',
  productId: '',
  name: 'pcs',
  code: 'pcs',
  factor: 1,
  isBase: false,
  barcode: null,
  prices: { retail: 0 },
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

/** @param {Partial<Unit>} [input] @returns {Unit} */
export function createUnit(input = {}) {
  const u = { ...UNIT_DEFAULTS, ...input };
  // Normalisasi prices: pastikan minimal ada 'retail'
  u.prices = { retail: 0, ...(u.prices || {}) };
  if (u.barcode === '') u.barcode = null;
  return u;
}

/** @param {Unit} u */
export function validateUnit(u) {
  if (!u.productId) throw new Error('Unit harus terkait produk');
  if (!u.name || !String(u.name).trim()) throw new Error('Nama unit wajib diisi');
  if (!Number.isFinite(u.factor) || u.factor <= 0) throw new Error('Faktor konversi harus > 0');
  for (const [level, harga] of Object.entries(u.prices || {})) {
    if (!Number.isFinite(harga) || harga < 0) {
      throw new Error(`Harga level "${level}" tidak valid`);
    }
  }
  return true;
}

/**
 * Harga untuk level tertentu, fallback ke retail.
 * @param {Unit} unit
 * @param {string} level
 */
export function unitPrice(unit, level = 'retail') {
  const prices = unit.prices || {};
  if (typeof prices[level] === 'number') return prices[level];
  if (typeof prices.retail === 'number') return prices.retail;
  return 0;
}