/**
 * src/services/auth-service.js
 * Login, logout, session, seed user, dan verifikasi role.
 * 
 * Session disimpan di sessionStorage agar:
 *  - Hilang saat tab/browser ditutup (lebih aman)
 *  - Setiap HP/karyawan punya sesi terpisah
 */

import { createUser, validateUser, USER_ROLES, canAccessPath } from '../models/user.js';
import { generateSalt, hashPin, verifyPin } from '../core/crypto-util.js';

const SESSION_KEY = 'kasir.user';
const REMEMBER_KEY = 'kasir.user.remember';

/* ===================== Seed User ===================== */

/**
 * Pastikan minimal ada satu user (Owner).
 * Dipanggil sekali saat app start.
 * 
 * Kalau users kosong:
 *  - Buat user "Owner" dengan username "owner"
 *  - PIN default: pakai cashierPin dari settings kalau ada, kalau tidak "1234"
 * 
 * @param {object} ctx
 * @returns {Promise<{ seeded: boolean, defaultPin?: string }>}
 */
export async function ensureSeedUser(ctx) {
  const existing = await ctx.repos.users.list();
  if (existing.length > 0) return { seeded: false };

  // Migrasi: kalau ada cashierPin lama, pakai PIN itu. Kalau tidak, default 1234.
  const legacyPin = ctx.settings?.cashierPin || '1234';
  const salt = generateSalt();
  const pinHash = await hashPin(legacyPin, salt);

  const user = createUser({
    id: '',
    name: 'Pemilik',
    username: 'owner',
    pinHash,
    pinSalt: salt,
    role: USER_ROLES.OWNER,
    active: true,
  });
  validateUser(user);
  await ctx.repos.users.save(user);

  return {
    seeded: true,
    defaultPin: existing.length === 0 && !ctx.settings?.cashierPin ? '1234' : null,
  };
}

/* ===================== Login / Logout ===================== */

/**
 * Login dengan username + PIN.
 * @param {object} ctx
 * @param {string} username
 * @param {string} pin
 * @param {boolean} [remember] true → simpan di localStorage (tetap login setelah tab tutup)
 * @returns {Promise<{ user: import('../models/user.js').USER_DEFAULTS }>}
 */
export async function login(ctx, username, pin, remember = false) {
  const uname = String(username || '').trim().toLowerCase();
  if (!uname) throw new Error('Username wajib diisi');
  if (!pin) throw new Error('PIN wajib diisi');

  // Cari user aktif dengan username
  const all = await ctx.repos.users.listAll();
  const user = all.find((u) => !u.deleted && u.username.toLowerCase() === uname);

  if (!user) {
    // Cegah enumeration: pesan sama untuk user tidak ada / PIN salah
    throw new Error('Username atau PIN salah');
  }
  if (!user.active) throw new Error('Akun dinonaktifkan. Hubungi Owner.');

  const ok = await verifyPin(String(pin), user.pinSalt, user.pinHash);
  if (!ok) throw new Error('Username atau PIN salah');

  // Update lastLogin
  await ctx.repos.users.patch(user.id, { lastLogin: Date.now() });

  // Simpan sesi
  const session = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    at: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }

  return { user };
}

/**
 * Logout: hapus sesi.
 */
export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  // Bersihkan cache lain yang terkait user
  sessionStorage.removeItem('kasir_logged_in');
  sessionStorage.removeItem('kasir.sw-reloaded');
}

/* ===================== Session ===================== */

/**
 * Ambil user yang sedang login.
 * @returns {{ id: string, name: string, username: string, role: string, at: number }|null}
 */
export function getCurrentUser() {
  // Cek sessionStorage dulu (aktif)
  const s = sessionStorage.getItem(SESSION_KEY);
  if (s) {
    try { return JSON.parse(s); } catch { /* fallback */ }
  }
  // Fallback ke localStorage (kalau "ingat saya" aktif)
  const r = localStorage.getItem(REMEMBER_KEY);
  if (r) {
    try {
      const parsed = JSON.parse(r);
      // Rehydrate ke sessionStorage
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      return parsed;
    } catch { /* ignore */ }
  }
  return null;
}

export function isLoggedIn() {
  return getCurrentUser() !== null;
}

/**
 * Ambil role user yang login.
 * @returns {string}
 */
export function getCurrentRole() {
  const u = getCurrentUser();
  return u ? u.role : '';
}

/**
 * Cek apakah user boleh akses path.
 * @param {string} path
 */
export function canAccess(path) {
  const u = getCurrentUser();
  if (!u) return false;
  return canAccessPath(path, u.role);
}

/* ===================== CRUD User ===================== */

/**
 * Buat user baru. Hanya Owner yang boleh memanggil.
 * @param {object} ctx
 * @param {{ name: string, username: string, pin: string, role: string }} data
 */
export async function createNewUser(ctx, data) {
  const cur = getCurrentUser();
  if (!cur || cur.role !== USER_ROLES.OWNER) {
    throw new Error('Hanya Pemilik yang bisa membuat user');
  }

  const uname = String(data.username || '').trim().toLowerCase();
  if (!uname) throw new Error('Username wajib diisi');

  // Cek duplikat
  const dup = await ctx.repos.users.findByIndex('by_username', uname);
  if (dup) throw new Error('Username sudah dipakai');

  if (!data.pin || String(data.pin).length < 4) {
    throw new Error('PIN minimal 4 digit');
  }
  if (!/^\d{4,6}$/.test(String(data.pin))) {
    throw new Error('PIN harus 4-6 digit angka');
  }

  const salt = generateSalt();
  const pinHash = await hashPin(String(data.pin), salt);

  const user = createUser({
    name: String(data.name || '').trim(),
    username: uname,
    pinHash,
    pinSalt: salt,
    role: data.role,
    active: true,
  });
  validateUser(user);
  return ctx.repos.users.save(user);
}

/**
 * Update user. Hanya Owner yang boleh.
 * Kalau `pin` diisi, PIN baru akan di-hash ulang.
 * @param {object} ctx
 * @param {string} id
 * @param {{ name?: string, role?: string, active?: boolean, pin?: string }} fields
 */
export async function updateUser(ctx, id, fields) {
  const cur = getCurrentUser();
  if (!cur || cur.role !== USER_ROLES.OWNER) {
    throw new Error('Hanya Pemilik yang bisa mengubah user');
  }

  const target = await ctx.repos.users.get(id);
  if (!target) throw new Error('User tidak ditemukan');

  const patch = {};
  if (fields.name !== undefined) patch.name = String(fields.name).trim();
  if (fields.role !== undefined) patch.role = fields.role;
  if (fields.active !== undefined) patch.active = !!fields.active;

  if (fields.pin) {
    if (!/^\d{4,6}$/.test(String(fields.pin))) {
      throw new Error('PIN harus 4-6 digit angka');
    }
    const salt = generateSalt();
    patch.pinHash = await hashPin(String(fields.pin), salt);
    patch.pinSalt = salt;
  }

  return ctx.repos.users.patch(id, patch);
}

/**
 * Hapus user (soft delete). Tidak boleh hapus diri sendiri, dan
 * harus ada minimal 1 owner aktif.
 * @param {object} ctx
 * @param {string} id
 */
export async function deleteUser(ctx, id) {
  const cur = getCurrentUser();
  if (!cur) throw new Error('Tidak ada sesi aktif');
  if (cur.id === id) throw new Error('Tidak bisa menghapus akun sendiri');

  const target = await ctx.repos.users.get(id);
  if (!target) throw new Error('User tidak ditemukan');

  // Kalau target owner, pastikan masih ada owner lain
  if (target.role === USER_ROLES.OWNER) {
    const owners = await ctx.repos.users.filter((u) => u.role === USER_ROLES.OWNER && u.id !== id);
    if (owners.length === 0) {
      throw new Error('Harus ada minimal 1 Pemilik aktif');
    }
  }

  return ctx.repos.users.softDelete(id);
}

/**
 * List user (untuk halaman manajemen user).
 * @param {object} ctx
 */
export async function listUsers(ctx) {
  const users = await ctx.repos.users.list();
  return users.sort((a, b) => {
    const order = { owner: 0, admin: 1, kasir: 2, salesman: 3 };
    const oa = order[a.role] ?? 99;
    const ob = order[b.role] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
}