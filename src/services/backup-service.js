/**
 * src/services/backup-service.js
 */

import {
  exportSnapshot, downloadSnapshot, importSnapshot, readSnapshotFile,
} from '../core/dbfile.js';

function dateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function createBackup(ctx) {
  const snap = await exportSnapshot(ctx.db);
  downloadSnapshot(snap, `kasir-backup-${dateStr()}.db`);
  return snap;
}

export async function restoreBackup(ctx, file, mode = 'merge') {
  const snap = await readSnapshotFile(file);
  const result = await importSnapshot(ctx.db, snap, { mode });
  return result;
}

export async function importOwnerDb(ctx, file) {
  try {
    const snap = await readSnapshotFile(file);

    if (snap.format !== 'kasir-dbfile') {
      throw new Error('File bukan snapshot NagaPos (.db) yang valid');
    }

    const currentSettings = (await ctx.repos.settings.get('app.settings')) || {};
    const preserved = {
      appRole: currentSettings.appRole || 'salesman',
      printerDeviceId: currentSettings.printerDeviceId || '',
      printerDeviceName: currentSettings.printerDeviceName || '',
      printerAutoConnect: currentSettings.printerAutoConnect || false,
      syncSupabaseUrl: currentSettings.syncSupabaseUrl || '',
      syncSupabaseAnonKey: currentSettings.syncSupabaseAnonKey || '',
      syncBucket: currentSettings.syncBucket || 'kasir-db',
      syncPath: currentSettings.syncPath || '',
      syncEnabled: currentSettings.syncEnabled || false,
      syncIntervalMs: currentSettings.syncIntervalMs || 60000,
      theme: currentSettings.theme || 'auto',
    };

    // FILTER: Salesman hanya butuh data master & data yang relevan
    // (JANGAN import transaksi `sales` atau `stockMovements` yang bisa ratusan MB)
    const skipStores = ['sales', 'stockMovements', 'auditLogs', 'shifts'];

    const result = await importSnapshot(ctx.db, snap, { mode: 'merge', skipStores });

    const postImportSettings = (await ctx.repos.settings.get('app.settings')) || {};
    const merged = { ...postImportSettings, ...preserved };
    await ctx.repos.settings.set('app.settings', merged);

    if (ctx.refreshSettings) {
      try { await ctx.refreshSettings(); } catch (e) { console.warn('[import] refresh gagal:', e); }
    }

    return result;
  } catch (err) {
    console.error('[importOwnerDb] error:', err);
    throw new Error(err?.message || 'Gagal memproses file database');
  }
}