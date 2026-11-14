/**
 * src/models/batch.js
 * Model untuk Batch / Lot — tracking per kelompok stok masuk
 * dengan tanggal kedaluwarsa.
 * 
 * Aturan FEFO: batch dengan expiryDate terdekat dijual duluan.
 */

export const BATCH_STATUS = Object.freeze({
  ACTIVE: 'active',
  DEPLETED: 'depleted',
  RETURNED: 'returned',
  EXPIRED: 'expired',
});

export const BATCH_STATUS_LABEL = Object.freeze({
  active: 'Aktif',
  depleted: 'Habis',
  returned: 'Diretur',
  expired: 'Kedaluwarsa',
});

export const BATCH_STATUS_COLOR = Object.freeze({
  active: 'success',
  depleted: 'info',
  returned: 'warning',
  expired: 'danger',
});

export const BATCH_DEFAULTS = {
  id: '',
  productId: '',
  batchNumber: '',        // BATCH-YYYYMMDD-NNNN
  qtyBase: 0,             // stok saat ini dalam base unit
  initialQtyBase: 0,      // stok awal saat masuk
  costPerBase: 0,         // HPP per base unit
  purchaseUnitId: '',     // referensi satuan saat beli (misal "dus")
  purchaseQty: 0,         // qty saat beli (misal 1)
  supplierId: '',
  purchaseId: '',         // referensi ke pembelian
  expiryDate: 0,          // timestamp (0 = tidak ada expiry)
  receivedAt: 0,          // kapan batch masuk
  status: 'active',
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
};

export function createBatch(input = {}) {
  return { ...BATCH_DEFAULTS, ...input };
}

export function validateBatch(b) {
  if (!b.productId) throw new Error('Produk wajib diisi');
  if (!Number.isFinite(b.qtyBase) || b.qtyBase < 0) throw new Error('Qty base tidak valid');
  if (b.expiryDate && !Number.isFinite(b.expiryDate)) throw new Error('Tanggal expired tidak valid');
  return true;
}

/**
 * Sisa hari sampai expired. Negatif = sudah lewat.
 * @param {object} batch
 * @param {number} [at]
 * @returns {number}
 */
export function daysToExpiry(batch, at = Date.now()) {
  if (!batch.expiryDate) return Infinity;
  const diffMs = batch.expiryDate - at;
  return Math.ceil(diffMs / (24 * 3600 * 1000));
}

/**
 * Status kalkulasi untuk display.
 * @param {object} batch
 * @param {number} [at]
 * @returns {'ok'|'warning'|'critical'|'expired'}
 */
export function expirySeverity(batch, at = Date.now()) {
  const days = daysToExpiry(batch, at);
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'warning';
  return 'ok';
}