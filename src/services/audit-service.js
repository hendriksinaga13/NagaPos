/**
 * src/services/audit-service.js
 * Pencatat & pembaca audit log.
 * 
 * Catatan penting: audit log TIDAK BOLEH gagal mengganggu aksi bisnis.
 * Jika penyimpanan log error, kita hanya warn di console — transaksi tetap jalan.
 */

import { createAuditLog } from '../models/audit-log.js';

/**
 * Catat satu aksi. Fire-and-forget — tidak throw.
 * 
 * @param {object} ctx
 * @param {{ action: string, details?: object }} opts
 * @returns {Promise<void>}
 */
export async function logAudit(ctx, opts) {
  try {
    if (!ctx.repos?.auditLogs) return;
    const log = createAuditLog({
      id: '',
      at: Date.now(),
      action: String(opts.action || 'unknown'),
      userId: ctx.deviceCode || 'kasir',
      details: opts.details || {},
    });
    await ctx.repos.auditLogs.save(log);
  } catch (e) {
    // Gagal catat log tidak boleh menggagalkan transaksi utama
    console.warn('[audit] gagal simpan log:', e);
  }
}

/**
 * Ambil daftar audit log dengan filter.
 * 
 * @param {object} ctx
 * @param {{
 *   from?: number,
 *   to?: number,
 *   action?: string,
 *   userId?: string,
 *   limit?: number,
 * }} [opts]
 * @returns {Promise<import('../models/audit-log.js').AUDIT_DEFAULTS[]>}
 */
export async function listAuditLogs(ctx, opts = {}) {
  const { from = 0, to = Date.now() + 1, action = '', userId = '', limit = 500 } = opts;
  if (!ctx.repos?.auditLogs) return [];
  let logs = await ctx.repos.auditLogs.list();
  logs = logs.filter((l) => {
    if (l.at < from || l.at >= to) return false;
    if (action && l.action !== action) return false;
    if (userId && l.userId !== userId) return false;
    return true;
  });
  logs.sort((a, b) => b.at - a.at);
  return logs.slice(0, limit);
}

/**
 * Hapus log yang lebih tua dari N hari.
 * Dipanggil manual dari halaman Pengaturan atau otomatis saat start.
 * 
 * @param {object} ctx
 * @param {number} daysToKeep
 * @returns {Promise<number>} jumlah terhapus
 */
export async function purgeOldLogs(ctx, daysToKeep = 90) {
  if (!ctx.repos?.auditLogs) return 0;
  const threshold = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  const all = await ctx.repos.auditLogs.list();
  const old = all.filter((l) => l.at < threshold);
  for (const l of old) {
    try { await ctx.repos.auditLogs.hardDelete(l.id); } catch {}
  }
  return old.length;
}

/**
 * Statistik ringkas untuk halaman audit.
 * @param {object} ctx
 * @param {{ from?: number, to?: number }} [period]
 */
export async function getAuditStats(ctx, period = {}) {
  const logs = await listAuditLogs(ctx, { ...period, limit: 100000 });
  const byAction = {};
  for (const l of logs) {
    byAction[l.action] = (byAction[l.action] || 0) + 1;
  }
  return { total: logs.length, byAction };
}