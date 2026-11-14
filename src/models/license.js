/**
 * src/models/license.js
 * Konstanta & model untuk sistem lisensi.
 * 
 * Format kode lisensi: `{EDITION}-{YYYYMMDD}-{SIG8}`
 * Contoh: `PRO-20271231-a1b2c3d4`
 * 
 * Signature di-hash dengan HMAC-SHA256 (secret internal) — pembeli tidak bisa generate sendiri.
 */

export const EDITION = Object.freeze({
  TRIAL: 'TRIAL',
  BASIC: 'BASIC',
  PRO: 'PRO',
  ENT: 'ENT',
});

export const EDITION_LABEL = Object.freeze({
  TRIAL: 'Trial',
  BASIC: 'Basic',
  PRO: 'Pro',
  ENT: 'Enterprise',
});

export const EDITION_COLOR = Object.freeze({
  TRIAL: 'warning',
  BASIC: 'primary',
  PRO: 'success',
  ENT: 'danger',
});

export const EDITION_PRICE = Object.freeze({
  TRIAL: 'Gratis 14 hari',
  BASIC: 'Rp 350.000',
  PRO: 'Rp 750.000',
  ENT: 'Rp 1.500.000',
});

export const EDITION_DESCRIPTION = Object.freeze({
  TRIAL: 'Coba semua fitur selama 14 hari. Setelah itu perlu aktivasi.',
  BASIC: 'Untuk toko kecil: kasir, produk, pelanggan, shift, laporan dasar.',
  PRO: 'Untuk toko profesional: semua fitur termasuk IMEI, batch expired, multi-user, audit log, salesman.',
  ENT: 'Untuk jaringan toko / franchise: semua fitur PRO + prioritas support.',
});

/* ===================== FEATURES ===================== */

export const FEATURE = Object.freeze({
  // Basic
  KASIR: 'kasir',
  PRODUK: 'produk',
  PELANGGAN: 'pelanggan',
  SHIFT: 'shift',
  LAPORAN: 'laporan',
  PRINTER: 'printer',
  BACKUP: 'backup',
  // Pro
  MULTI_USER: 'multi_user',
  AUDIT_LOG: 'audit_log',
  SERIAL_IMEI: 'serial_imei',
  BATCH_EXPIRY: 'batch_expiry',
  BARCODE_GEN: 'barcode_gen',
  SALES_ORDER: 'sales_order',
  WHATSAPP_RECEIPT: 'whatsapp_receipt',
  CUSTOMER_DISPLAY: 'customer_display',
  KEYBOARD_SHORTCUTS: 'keyboard_shortcuts',
  // Enterprise
  SELF_ORDER: 'self_order',
  LOYALTY: 'loyalty',
  VOUCHER: 'voucher',
  DASHBOARD: 'dashboard',
  MULTI_OUTLET: 'multi_outlet',
});

export const FEATURE_LABEL = Object.freeze({
  kasir: 'Kasir / POS',
  produk: 'Manajemen Produk',
  pelanggan: 'Pelanggan',
  shift: 'Shift Kasir',
  laporan: 'Laporan',
  printer: 'Cetak Struk',
  backup: 'Backup & Restore',
  multi_user: 'Multi-User & Role',
  audit_log: 'Audit Log',
  serial_imei: 'IMEI / Serial Tracking',
  batch_expiry: 'Batch & Expired Date',
  barcode_gen: 'Barcode Generator',
  sales_order: 'Sales Order (Salesman)',
  whatsapp_receipt: 'Struk via WhatsApp',
  customer_display: 'Layar Pelanggan',
  keyboard_shortcuts: 'Keyboard Shortcuts',
  self_order: 'Self-Order (QR)',
  loyalty: 'Loyalty Points',
  voucher: 'Voucher & Promo',
  dashboard: 'Dashboard Analytics',
  multi_outlet: 'Multi Outlet',
});

/** Fitur per edisi. */
export const EDITION_FEATURES = Object.freeze({
  TRIAL: ['*'], // semua fitur
  BASIC: [
    'kasir', 'produk', 'pelanggan', 'shift', 'laporan',
    'printer', 'backup', 'barcode_gen', 'customer_display',
    'keyboard_shortcuts', 'whatsapp_receipt',
  ],
  PRO: ['*'], // semua fitur
  ENT: ['*'], // semua fitur
});

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7; // masa tenggang setelah expired

/* ===================== PAYLOAD & PARSING ===================== */

/**
 * @typedef {Object} LicensePayload
 * @property {string}  edition       'TRIAL'|'BASIC'|'PRO'|'ENT'
 * @property {number}  expiry        timestamp (ms) tanggal expired
 * @property {string}  expiryStr     format YYYYMMDD
 * @property {string}  signature     8 char hex
 * @property {string}  key           full license key
 * @property {boolean} valid         signature cocok?
 */

const KEY_REGEX = /^(TRIAL|BASIC|PRO|ENT)-(\d{8})-([a-f0-9]{8})$/i;

/**
 * Parse string key menjadi bagian-bagiannya (BELUM verify signature).
 * @param {string} key
 * @returns {LicensePayload|null}
 */
export function parseLicenseKey(key) {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim().toUpperCase();
  const m = trimmed.match(KEY_REGEX);
  if (!m) return null;

  const [, editionStr, expiryStr, signature] = m;
  const year = Number(expiryStr.slice(0, 4));
  const month = Number(expiryStr.slice(4, 6));
  const day = Number(expiryStr.slice(6, 8));

  // Validasi tanggal masuk akal
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const expiry = new Date(year, month - 1, day, 23, 59, 59).getTime();
  if (!Number.isFinite(expiry)) return null;

  return {
    edition: editionStr,
    expiry,
    expiryStr,
    signature,
    key: trimmed,
    valid: false, // di-set oleh verifier
  };
}

/**
 * Generate string payload untuk signing.
 * @param {string} edition
 * @param {string} expiryStr
 */
export function buildSignablePayload(edition, expiryStr) {
  return `${String(edition).toUpperCase()}|${expiryStr}`;
}

/**
 * Ambil daftar fitur untuk edisi.
 * @param {string} edition
 * @returns {string[]} array fitur (atau ['*'] untuk semua)
 */
export function featuresForEdition(edition) {
  return EDITION_FEATURES[edition] || [];
}

/**
 * Cek apakah array fitur mengandung fitur tertentu (atau '*').
 * @param {string[]} features
 * @param {string} featureName
 */
export function hasFeatureInList(features, featureName) {
  if (!features || features.length === 0) return false;
  if (features.includes('*')) return true;
  return features.includes(featureName);
}