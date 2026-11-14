/**
 * src/models/stock.js
 * Mutasi stok. Perubahan stok produk dilakukan oleh inventory-service
 * (tahap 7) dengan mencatat StockMovement + update product.stock.
 */

/**
 * @typedef {import('../core/schema.js').StockMovement} StockMovement
 */

export const STOCK_TYPE = Object.freeze({
  IN: 'in',
  OUT: 'out',
  ADJUST: 'adjust',
  TRANSFER: 'transfer',
  RETURN: 'return',
  VOID: 'void',
});

export const STOCK_TYPE_LABEL = Object.freeze({
  in: 'Stok Masuk',
  out: 'Stok Keluar',
  adjust: 'Opname',
  transfer: 'Mutasi',
  return: 'Retur',
  void: 'Void',
});

export const STOCK_DEFAULTS = /** @type {StockMovement} */ ({
  id: '',
  productId: '',
  unitId: '',
  type: 'in',
  qty: 0,
  factor: 1,
  qtyBase: 0,
  stockAfter: 0,
  refType: '',
  refId: '',
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

/** @param {Partial<StockMovement>} [input] @returns {StockMovement} */
export function createStockMovement(input = {}) {
  const m = { ...STOCK_DEFAULTS, ...input };
  if (!m.qtyBase) m.qtyBase = (Number(m.qty) || 0) * (Number(m.factor) || 1);
  return m;
}

/** @param {StockMovement} m */
export function validateStockMovement(m) {
  if (!m.productId) throw new Error('Mutasi tanpa produk');
  if (!Object.values(STOCK_TYPE).includes(m.type)) throw new Error('Tipe mutasi tidak valid');
  if (!Number.isFinite(m.qtyBase)) throw new Error('qtyBase tidak valid');
  return true;
}