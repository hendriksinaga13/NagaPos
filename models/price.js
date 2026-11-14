/**
 * src/models/price.js
 * Util level harga. Harga disimpan pada `unit.prices[level]`.
 * Level default: 'retail'. Level lain (mis. 'grosir', 'member') opsional.
 */

export const PRICE_LEVELS = /** @type {const} */ (['retail', 'grosir', 'member']);
export const DEFAULT_PRICE_LEVEL = 'retail';

/**
 * Pastikan objek harga punya semua level yang dikenal (default 0).
 * @param {Record<string, number>} [prices]
 */
export function normalizePrices(prices = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const lv of PRICE_LEVELS) {
    const v = prices[lv];
    out[lv] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  }
  // level kustom dipertahankan
  for (const [k, v] of Object.entries(prices)) {
    if (!(k in out) && Number.isFinite(v) && v >= 0) out[k] = Math.round(v);
  }
  return out;
}

/**
 * Ambil harga untuk level, fallback ke retail.
 * @param {Record<string, number>|undefined} prices
 * @param {string} [level]
 * @returns {number}
 */
export function priceFor(prices, level = DEFAULT_PRICE_LEVEL) {
  if (!prices) return 0;
  if (typeof prices[level] === 'number') return prices[level];
  if (typeof prices.retail === 'number') return prices.retail;
  const first = Object.values(prices).find((v) => typeof v === 'number');
  return first || 0;
}