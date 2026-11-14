/**
 * src/services/pricing-service.js
 * Fungsi murni untuk menentukan harga satuan dan subtotal baris.
 *
 * Konsep:
 *  - Harga disimpan di `unit.prices[level]` (integer rupiah per 1 unit).
 *  - `factor` unit = konversi ke satuan base. Dijual per unit, bukan per base.
 *  - Level fallback: level yang diminta → 'retail' → nilai numerik pertama.
 */

import { priceFor, DEFAULT_PRICE_LEVEL } from '../models/price.js';

/**
 * Harga per unit untuk level tertentu.
 * @param {import('../core/schema.js').Unit} unit
 * @param {string} [priceLevel]
 * @returns {number}
 */
export function resolveUnitPrice(unit, priceLevel = DEFAULT_PRICE_LEVEL) {
  if (!unit) return 0;
  return Math.max(0, Math.round(priceFor(unit.prices, priceLevel)));
}

/**
 * Subtotal baris (sebelum diskon baris).
 * @param {import('../core/schema.js').Unit} unit
 * @param {number} qty
 * @param {string} [priceLevel]
 * @returns {number}
 */
export function computeLineSubtotal(unit, qty, priceLevel = DEFAULT_PRICE_LEVEL) {
  const price = resolveUnitPrice(unit, priceLevel);
  const q = Math.max(0, Number(qty) || 0);
  return Math.round(q * price);
}

/**
 * Konversi qty dalam satuan unit tertentu ke base.
 * @param {number} qty
 * @param {number} factor
 */
export function toBaseQty(qty, factor) {
  return (Number(qty) || 0) * (Number(factor) || 1);
}

/**
 * Harga pokok total untuk baris (untuk perhitungan laba).
 * @param {import('../core/schema.js').Product} product
 * @param {number} qty
 * @param {number} factor
 */
export function lineCost(product, qty, factor) {
  return Math.round((Number(product?.cost) || 0) * toBaseQty(qty, factor));
}