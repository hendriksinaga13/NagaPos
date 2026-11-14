/**
 * src/core/id.js
 * Generator ID, kode perangkat, dan nomor dokumen.
 * Format nomor: {PREFIX}-{DEVICE}-{YYYYMMDD}-{SEQ4}
 */

import { idbReq } from './db.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** ID unik berbasis waktu + acak. Bisa dipakai multi-perangkat tanpa bentrok. */
export function newId() {
  const ts = Date.now().toString(36);
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  }
  return `${ts}-${rand}`;
}

/** Kode 4 huruf A-Z, stabil per perangkat. */
export function newDeviceCode() {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += ALPHABET[10 + ((Math.random() * 26) | 0)];
  }
  return s.toUpperCase();
}

/** @param {number} ts */
export function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** @param {number} ts */
export function monthKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ambil (atau buat sekali) kode perangkat dari settings.
 * @param {import('./db.js').Database} db
 * @returns {Promise<string>}
 */
export async function getDeviceCode(db) {
  const rec = await db.get('settings', 'device.code');
  if (rec && rec.value) return rec.value;

  return db.withTransaction(['settings'], 'readwrite', async (tx) => {
    const store = tx.objectStore('settings');
    const existing = await idbReq(store.get('device.code'));
    if (existing && existing.value) return existing.value;
    const code = newDeviceCode();
    await idbReq(store.put({ key: 'device.code', value: code, updatedAt: Date.now() }));
    return code;
  });
}

/**
 * Buat nomor dokumen berikutnya (atomik per hari).
 * @param {import('./db.js').Database} db
 * @param {{ prefix?: string, kind?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function nextDocNumber(db, { prefix = 'INV', kind = 'sale' } = {}) {
  const dk = dateKey();
  const counterKey = `counter.${kind}.${dk}`;

  return db.withTransaction(['settings'], 'readwrite', async (tx) => {
    const store = tx.objectStore('settings');

    let dcRec = await idbReq(store.get('device.code'));
    let dc = dcRec && dcRec.value;
    if (!dc) {
      dc = newDeviceCode();
      await idbReq(store.put({ key: 'device.code', value: dc, updatedAt: Date.now() }));
    }

    const cur = await idbReq(store.get(counterKey));
    const next = ((cur && cur.value) || 0) + 1;
    await idbReq(store.put({ key: counterKey, value: next, updatedAt: Date.now() }));

    return `${prefix}-${dc}-${dk}-${String(next).padStart(4, '0')}`;
  });
}