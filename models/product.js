/**
 * src/models/product.js
 * Model produk + dukungan serial/IMEI + expiry tracking.
 */

/**
 * @typedef {import('../core/schema.js').Product} Product
 */

export const PRODUCT_DEFAULTS = /** @type {Product} */ ({
  id: '',
  name: '',
  category: '',
  sku: '',
  baseUnitId: '',
  cost: 0,
  stock: 0,
  minStock: 0,
  active: true,
  notes: '',
  trackSerial: false,
  warrantyMonths: 0,
  trackExpiry: false,
  shelfLifeDays: 0,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

export function createProduct(input = {}) {
  return { ...PRODUCT_DEFAULTS, ...input };
}

export function validateProduct(p) {
  if (!p.name || !String(p.name).trim()) throw new Error('Nama produk wajib diisi');
  if (!Number.isFinite(p.cost) || p.cost < 0) throw new Error('Harga pokok tidak valid');
  if (!Number.isFinite(p.minStock) || p.minStock < 0) throw new Error('Stok minimum tidak valid');
  if (p.warrantyMonths !== undefined) {
    if (!Number.isFinite(p.warrantyMonths) || p.warrantyMonths < 0) {
      throw new Error('Masa garansi tidak valid');
    }
  }
  if (p.shelfLifeDays !== undefined) {
    if (!Number.isFinite(p.shelfLifeDays) || p.shelfLifeDays < 0) {
      throw new Error('Masa simpan tidak valid');
    }
  }
  return true;
}

export function isLowStock(p) {
  return p.minStock > 0 && p.stock <= p.minStock;
}