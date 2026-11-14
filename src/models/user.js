/**
 * src/models/user.js
 * Model & konstanta untuk user management.
 * 
 * Roles:
 *  - OWNER   : akses penuh, kelola user, laporan, semua menu
 *  - ADMIN   : kelola master data + laporan, tidak bisa kelola user
 *  - KASIR   : hanya kasir, pembayaran, shift pribadi, riwayat pribadi
 *  - SALESMAN: hanya dashboard salesman + buat SO
 */

export const USER_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  KASIR: 'kasir',
  SALESMAN: 'salesman',
});

export const ROLE_LABEL = Object.freeze({
  owner: 'Pemilik',
  admin: 'Admin',
  kasir: 'Kasir',
  salesman: 'Salesman',
});

export const ROLE_COLOR = Object.freeze({
  owner: 'danger',
  admin: 'warning',
  kasir: 'primary',
  salesman: 'info',
});

/**
 * Daftar role yang boleh mengakses route tertentu.
 * Dipakai untuk route guard di app.js.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  '/kasir': ['owner', 'admin', 'kasir'],
  '/pembayaran': ['owner', 'admin', 'kasir'],
  '/riwayat': ['owner', 'admin', 'kasir'],
  '/shift': ['owner', 'admin', 'kasir'],
  '/produk': ['owner', 'admin'],
  '/satuan': ['owner', 'admin'],
  '/diskon': ['owner', 'admin'],
  '/inventori': ['owner', 'admin'],
  '/pelanggan': ['owner', 'admin', 'kasir'],
  '/supplier': ['owner', 'admin'],
  '/pembelian': ['owner', 'admin'],
  '/laporan': ['owner', 'admin'],
  '/printer': ['owner', 'admin'],
  '/sinkron': ['owner'],
  '/pengaturan': ['owner'],
  '/users': ['owner'],
  '/audit-log': ['owner', 'admin'],
  '/sales-order': ['owner', 'admin', 'kasir'],
  '/barcode-generator': ['owner', 'admin'],
  '/salesman': ['salesman', 'owner'],
  '/sales-order-baru': ['salesman', 'owner'],
  '/tentang': ['owner', 'admin', 'kasir', 'salesman'],
  '/syarat-ketentuan': ['owner', 'admin', 'kasir', 'salesman'],
  '/kebijakan-privasi': ['owner', 'admin', 'kasir', 'salesman'],
  '/lainnya': ['owner', 'admin', 'kasir'],
});

export const USER_DEFAULTS = {
  id: '',
  name: '',
  username: '',
  pinHash: '',
  pinSalt: '',
  role: 'kasir',
  active: true,
  lastLogin: 0,
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
};

export function createUser(input = {}) {
  return { ...USER_DEFAULTS, ...input };
}

export function validateUser(u) {
  if (!u.name || !String(u.name).trim()) throw new Error('Nama wajib diisi');
  if (!u.username || !String(u.username).trim()) throw new Error('Username wajib diisi');
  if (!/^[a-z0-9_.-]{3,20}$/i.test(u.username)) {
    throw new Error('Username hanya boleh 3-20 karakter: huruf, angka, titik, strip, underscore');
  }
  if (!Object.values(USER_ROLES).includes(u.role)) {
    throw new Error('Role tidak valid');
  }
  return true;
}

/**
 * Cek apakah user boleh akses path.
 * @param {string} path
 * @param {string} role
 */
export function canAccessPath(path, role) {
  const allowed = ROLE_PERMISSIONS[path];
  if (!allowed) return true; // route tidak dibatasi
  return allowed.includes(role);
}