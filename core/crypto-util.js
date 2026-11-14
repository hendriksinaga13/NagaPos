/**
 * src/core/crypto-util.js
 * Hash PIN dengan SHA-256 + salt.
 * Web Crypto API native — tidak butuh library.
 * 
 * PIN 4-6 digit sudah cukup aman untuk aplikasi kasir lokal:
 * brute force butuh waktu, dan hash disimpan di IndexedDB perangkat.
 * 
 * Untuk keamanan lebih tinggi (multi-device sync), bisa upgrade ke PBKDF2 nanti.
 */

/**
 * Buat salt acak 16 byte, encode ke hex.
 * @returns {string}
 */
export function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash PIN dengan salt via SHA-256.
 * @param {string} pin
 * @param {string} salt
 * @returns {Promise<string>} hex string 64 char
 */
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`nagapos:v1:${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifikasi PIN terhadap hash tersimpan.
 * @param {string} pin
 * @param {string} salt
 * @param {string} expectedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, salt, expectedHash) {
  if (!pin || !salt || !expectedHash) return false;
  const computed = await hashPin(pin, salt);
  // Perbandingan constant-time sederhana (meski di JS tetap tidak sepenuhnya aman,
  // tapi setidaknya tidak short-circuit seperti `===` biasa)
  if (computed.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}