/**
 * src/core/dbfile.js
 */

import { STORES } from './schema.js';
import { getDeviceCode } from './id.js';

export const DBFILE_FORMAT = 'kasir-dbfile';
export const DBFILE_VERSION = 1;

export async function exportSnapshot(db) {
  const stores = {};
  for (const def of STORES) {
    stores[def.name] = await db.getAll(def.name);
  }
  let deviceCode = null;
  try { deviceCode = await getDeviceCode(db); } catch { /* noop */ }

  return {
    format: DBFILE_FORMAT,
    version: DBFILE_VERSION,
    exportedAt: Date.now(),
    deviceCode,
    stores,
  };
}

export async function importSnapshot(db, snapshot, { mode = 'merge', skipStores = [] } = {}) {
  if (!snapshot || snapshot.format !== DBFILE_FORMAT) {
    throw new Error('Format file tidak dikenali (bukan file NagaPos)');
  }

  if (mode === 'replace') {
    for (const def of STORES) {
      if (!skipStores.includes(def.name)) {
        try { await db.clear(def.name); } catch(e){}
      }
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const def of STORES) {
    // Skip tabel yang tidak perlu (sales, dll)
    if (skipStores.includes(def.name)) continue;

    const records = snapshot.stores?.[def.name];
    if (!Array.isArray(records) || records.length === 0) continue;
    const kp = def.keyPath;
    const toPut = [];

    for (const rec of records) {
      const key = rec?.[kp];
      if (key === undefined || key === null) { skipped++; continue; }
      
      if (mode === 'merge') {
        try {
          const existing = await db.get(def.name, key);
          if (existing && (existing.updatedAt || 0) >= (rec.updatedAt || 0)) { 
            skipped++; 
            continue; 
          }
        } catch (e) { /* abaikan error baca */ }
      }
      toPut.push(rec);
    }

    // Simpan per 50 record agar stabil
    const CHUNK_SIZE = 50;
    for (let i = 0; i < toPut.length; i += CHUNK_SIZE) {
      const chunk = toPut.slice(i, i + CHUNK_SIZE);
      try {
        await db.putMany(def.name, chunk);
        imported += chunk.length;
      } catch (err) {
        // Fallback: Jika ada data bentrok, simpan sisanya satu per satu
        for (const rec of chunk) {
          try {
            await db.put(def.name, rec);
            imported++;
          } catch (e) {
            skipped++;
          }
        }
      }
    }
  }

  return { imported, skipped };
}

export function downloadSnapshot(snapshot, filename) {
  const name = filename || `kasir-${new Date().toISOString().slice(0, 10)}.db`;
  const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readSnapshotFile(file) {
  // Deteksi ukuran file (maks 40MB untuk mencegah crash RAM)
  if (file.size > 40 * 1024 * 1024) {
    throw new Error('File terlalu besar (>40MB). Minta Owner export DB "Hanya Master" agar lebih ringan.');
  }

  let text;
  try {
    text = await file.text();
  } catch (err) {
    throw new Error('Gagal membaca file. HP kehabisan memori.');
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('File database rusak atau tidak valid (bukan JSON).');
  }
  return json;
}