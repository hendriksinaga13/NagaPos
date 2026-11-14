/**
 * src/models/serial-number.js
 * Model untuk Serial Number / IMEI.
 * 
 * Setiap unit fisik produk = 1 record serial.
 * status:
 *  - in_stock : tersedia untuk dijual
 *  - sold     : sudah terjual, linked ke sale
 *  - returned : pernah dijual lalu diretur
 *  - damaged  : rusak / hilang, tidak bisa dijual
 */

export const SERIAL_STATUS = Object.freeze({
  IN_STOCK: 'in_stock',
  SOLD: 'sold',
  RETURNED: 'returned',
  DAMAGED: 'damaged',
});

export const SERIAL_STATUS_LABEL = Object.freeze({
  in_stock: 'Tersedia',
  sold: 'Terjual',
  returned: 'Diretur',
  damaged: 'Rusak',
});

export const SERIAL_STATUS_COLOR = Object.freeze({
  in_stock: 'success',
  sold: 'primary',
  returned: 'warning',
  damaged: 'danger',
});

export const SERIAL_DEFAULTS = {
  id: '',
  productId: '',
  unitId: '',
  serial: '',
  status: 'in_stock',
  purchaseId: '',
  purchasePrice: 0,
  purchaseDate: 0,
  soldSaleId: '',
  soldAt: 0,
  soldPrice: 0,
  customerId: null,
  customerName: '',
  warrantyUntil: 0,
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
};

export function createSerialNumber(input = {}) {
  return { ...SERIAL_DEFAULTS, ...input };
}

export function validateSerialNumber(s) {
  if (!s.productId) throw new Error('Produk wajib diisi');
  if (!s.serial || !String(s.serial).trim()) throw new Error('Serial/IMEI wajib diisi');
  if (String(s.serial).length > 50) throw new Error('Serial terlalu panjang (maks 50 karakter)');
  if (String(s.serial).length < 3) throw new Error('Serial terlalu pendek (min 3 karakter)');
  return true;
}

/** Cek apakah serial sudah lewat masa garansi */
export function isWarrantyExpired(serial, at = Date.now()) {
  if (!serial.warrantyUntil) return false;
  return at > serial.warrantyUntil;
}

/** Cek apakah garansi masih aktif */
export function isWarrantyActive(serial, at = Date.now()) {
  if (!serial.warrantyUntil) return false;
  return at <= serial.warrantyUntil;
}