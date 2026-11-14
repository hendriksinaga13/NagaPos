/**
 * src/core/utils.js
 * Util umum: format uang, tanggal, debounce, escape HTML.
 */

/** Format integer → "Rp 1.234.567". */
export function formatRupiah(n) {
  const num = Math.round(Number(n) || 0);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${str}`;
}

/** "Rp 1.234.567" / "1234567" → 1234567. */
export function parseRupiah(s) {
  if (typeof s === 'number') return Math.round(s);
  const digits = String(s ?? '').replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return 0;
  return parseInt(digits, 10) || 0;
}

/** "1.234" (desimal Indonesia) → 1234, atau "1,5" → 1.5. */
export function parseQty(s) {
  if (typeof s === 'number') return s;
  const normalized = String(s ?? '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** "1.234,5" atau "1,234.5" toleran. Untuk input qty. */
export function parseNumberID(s) {
  if (typeof s === 'number') return s;
  const raw = String(s ?? '').trim();
  if (!raw) return 0;
  // Jika ada koma dan titik, asumsi koma = desimal (format ID)
  if (raw.includes(',') && raw.includes('.')) {
    return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (raw.includes(',')) {
    return parseFloat(raw.replace(',', '.')) || 0;
  }
  return parseFloat(raw) || 0;
}

/** Tanggal singkat: "13 Nov 2026". */
export function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Tanggal+jam: "13 Nov 2026 14:05". */
export function formatDateTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Jam: "14:05". */
export function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  });
}

/** @param {Function} fn @param {number} [ms] */
export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** @template T @param {Function} fn @param {number} [ms] @returns {Function} */
export function throttle(fn, ms = 100) {
  let last = 0, timer = null, lastArgs = null;
  return (...args) => {
    lastArgs = args;
    const now = Date.now();
    const remain = ms - (now - last);
    if (remain <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...lastArgs);
      }, remain);
    }
  };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Bulatkan ke 100 rupiah terdekat. */
export function roundTo100(n) {
  return Math.round(n / 100) * 100;
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Ambil field yang dikenal saja (untuk mencegah field nyasar masuk DB). */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/** Uint8/ArrayBuffer → hex (untuk hash/debug). */
export function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}