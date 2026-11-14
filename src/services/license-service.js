/**
 * src/services/license-service.js
 * Aktivasi, validasi, dan state lisensi.
 * 
 * Mekanisme:
 *  - Tersimpan di settings: `licenseKey`, `licenseActivatedAt`
 *  - Trial otomatis aktif 14 hari dari install pertama
 *  - Grace period 7 hari setelah expired
 *  - Setelah grace: locked (read-only)
 */

import {
  EDITION, TRIAL_DAYS, GRACE_DAYS, FEATURE,
  parseLicenseKey, buildSignablePayload,
  featuresForEdition, hasFeatureInList,
} from '../models/license.js';
import { toast } from '../ui/components/toast.js';

/* ===================== SECRET (OBFUSCATED) ===================== */

/**
 * Secret untuk verifikasi HMAC.
 * Di-obfuscate dengan XOR agar tidak plain-text di source.
 * 
 * ⚠️ Ini bukan security bank-grade. Pembeli teknis bisa reverse-engineer.
 * Untuk keamanan serius, gunakan asymmetric signing (ECDSA) nanti.
 */
const _obfuscated = [0x6e, 0x61, 0x67, 0x61, 0x70, 0x6f, 0x73, 0x2d, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0x2d, 0x32, 0x30, 0x32, 0x36];

function getSecret() {
  return String.fromCharCode(..._obfuscated);
}

/* ===================== HMAC ===================== */

/**
 * Hitung HMAC-SHA256 untuk payload, return hex (64 char).
 * @param {string} payload
 * @returns {Promise<string>}
 */
async function hmacSign(payload) {
  const secret = getSecret();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifikasi signature dari license key.
 * @param {string} edition
 * @param {string} expiryStr
 * @param {string} signature 8 char
 * @returns {Promise<boolean>}
 */
async function verifySignature(edition, expiryStr, signature) {
  const payload = buildSignablePayload(edition, expiryStr);
  const expected = (await hmacSign(payload)).slice(0, 8);
  // Constant-time compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/* ===================== VERIFY ===================== */

/**
 * Validasi license key lengkap (parse + verify signature + cek expiry).
 * 
 * @param {string} key
 * @returns {Promise<{
 *   valid: boolean,
 *   edition: string,
 *   features: string[],
 *   expiry: number,
 *   expired: boolean,
 *   grace: boolean,
 *   daysLeft: number,
 *   error?: string,
 * }>}
 */
export async function verifyLicenseKey(key) {
  const parsed = parseLicenseKey(key);
  if (!parsed) {
    return {
      valid: false, edition: '', features: [], expiry: 0,
      expired: false, grace: false, daysLeft: 0,
      error: 'Format kode tidak valid',
    };
  }

  const sigOk = await verifySignature(parsed.edition, parsed.expiryStr, parsed.signature);
  if (!sigOk) {
    return {
      valid: false, edition: '', features: [], expiry: 0,
      expired: false, grace: false, daysLeft: 0,
      error: 'Kode tidak valid (signature salah)',
    };
  }

  const now = Date.now();
  const expired = now > parsed.expiry;
  const graceMs = GRACE_DAYS * 24 * 3600 * 1000;
  const grace = expired && (now - parsed.expiry) <= graceMs;
  const daysLeft = Math.ceil((parsed.expiry - now) / (24 * 3600 * 1000));

  return {
    valid: true,
    edition: parsed.edition,
    features: featuresForEdition(parsed.edition),
    expiry: parsed.expiry,
    expired,
    grace,
    daysLeft,
  };
}

/* ===================== STATE ===================== */

/**
 * @typedef {Object} LicenseState
 * @property {'trial'|'licensed'|'expired'|'locked'} status
 * @property {string} edition
 * @property {string[]} features
 * @property {number} expiry
 * @property {number} daysLeft
 * @property {boolean} isTrial
 * @property {boolean} isExpired
 * @property {boolean} isLocked  (setelah grace habis)
 * @property {string} key
 */

/**
 * Bangun state lisensi dari settings.
 * @param {object} ctx
 * @returns {Promise<LicenseState>}
 */
export async function getLicenseState(ctx) {
  const settings = ctx.settings || {};
  const key = settings.licenseKey || '';
  const now = Date.now();

  // 1. Kalau ada key → verify
  if (key) {
    const result = await verifyLicenseKey(key);
    if (result.valid) {
      const status = result.expired
        ? (result.grace ? 'licensed' : 'locked')
        : 'licensed';
      return {
        status,
        edition: result.edition,
        features: result.features,
        expiry: result.expiry,
        daysLeft: result.daysLeft,
        isTrial: false,
        isExpired: result.expired,
        isLocked: status === 'locked',
        key,
      };
    }
  }

  // 2. Trial: cek `licenseActivatedAt`
  let activatedAt = settings.licenseActivatedAt || 0;
  if (!activatedAt) {
    // Aktifkan trial sekali
    activatedAt = now;
    try {
      await ctx.repos.settings.set('app.settings', {
        ...settings,
        licenseActivatedAt: activatedAt,
      });
      if (ctx.settings) ctx.settings.licenseActivatedAt = activatedAt;
    } catch (e) {
      console.warn('[license] gagal set activatedAt:', e);
    }
  }

  const trialMs = TRIAL_DAYS * 24 * 3600 * 1000;
  const trialExpiry = activatedAt + trialMs;
  const expired = now > trialExpiry;
  const graceMs = GRACE_DAYS * 24 * 3600 * 1000;
  const grace = expired && (now - trialExpiry) <= graceMs;
  const daysLeft = Math.ceil((trialExpiry - now) / (24 * 3600 * 1000));

  return {
    status: expired ? (grace ? 'trial' : 'locked') : 'trial',
    edition: EDITION.TRIAL,
    features: featuresForEdition(EDITION.TRIAL),
    expiry: trialExpiry,
    daysLeft,
    isTrial: true,
    isExpired: expired,
    isLocked: expired && !grace,
    key: '',
  };
}

/* ===================== ACTIONS ===================== */

/**
 * Aktivasi license baru.
 * @param {object} ctx
 * @param {string} key
 * @returns {Promise<{ success: boolean, state?: LicenseState, error?: string }>}
 */
export async function activateLicense(ctx, key) {
  const result = await verifyLicenseKey(key);
  if (!result.valid) {
    return { success: false, error: result.error || 'Kode tidak valid' };
  }
  if (result.expired && !result.grace) {
    return { success: false, error: 'Kode sudah kedaluwarsa' };
  }

  await ctx.repos.settings.set('app.settings', {
    ...(ctx.settings || {}),
    licenseKey: key.trim().toUpperCase(),
    licenseActivatedAt: Date.now(),
  });

  // Refresh ctx.settings
  if (ctx.refreshSettings) await ctx.refreshSettings();
  else if (ctx.settings) ctx.settings.licenseKey = key.trim().toUpperCase();

  const state = await getLicenseState(ctx);
  return { success: true, state };
}

/**
 * Hapus lisensi (untuk reset/test).
 * @param {object} ctx
 */
export async function deactivateLicense(ctx) {
  await ctx.repos.settings.set('app.settings', {
    ...(ctx.settings || {}),
    licenseKey: '',
    licenseActivatedAt: 0,
  });
  if (ctx.refreshSettings) await ctx.refreshSettings();
}

/* ===================== FEATURE CHECK ===================== */

/**
 * Cek apakah user punya akses ke fitur tertentu.
 * @param {object} ctx
 * @param {string} featureName
 * @returns {boolean}
 */
export function canUse(ctx, featureName) {
  const state = ctx.license;
  if (!state) return true; // fallback: allow jika belum bootstrap
  if (state.isLocked) return false;
  return hasFeatureInList(state.features, featureName);
}

/**
 * Tampilkan toast warning jika fitur tidak tersedia.
 */
export function warnFeatureLocked(featureName) {
  toast(
    `Fitur ini membutuhkan lisensi PRO. Buka menu Lisensi untuk aktivasi.`,
    { type: 'warning', duration: 4000 },
  );
}