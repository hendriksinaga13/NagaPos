/**
 * src/services/serial-service.js
 * CRUD + lookup + status transition untuk Serial Number / IMEI.
 * 
 * Status flow:
 *   in_stock → sold → returned → in_stock (bisa dijual lagi) 
 *                   ↘ damaged
 *   in_stock → damaged (langsung rusak, tidak pernah dijual)
 */

import { newId } from '../core/id.js';
import {
  createSerialNumber, validateSerialNumber,
  SERIAL_STATUS,
} from '../models/serial-number.js';
import { logAudit } from './audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';

/* ===================== READ ===================== */

/**
 * Ambil semua serial dengan filter.
 * @param {object} ctx
 * @param {{
 *   productId?: string,
 *   status?: string,
 *   search?: string,
 *   limit?: number,
 * }} [opts]
 */
export async function listSerials(ctx, opts = {}) {
  const { productId = '', status = '', search = '', limit = 500 } = opts;
  let list = await ctx.repos.serialNumbers.list();

  if (productId) list = list.filter((s) => s.productId === productId);
  if (status) list = list.filter((s) => s.status === status);

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter((s) =>
      s.serial.toLowerCase().includes(q) ||
      (s.customerName || '').toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q),
    );
  }

  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list.slice(0, limit);
}

/** Cari 1 serial by string (unique index). */
export async function findSerialByCode(ctx, serial) {
  if (!serial) return null;
  const s = await ctx.repos.serialNumbers.findByIndex('by_serial', String(serial).trim());
  return s || null;
}

/** Ambil by id. */
export async function getSerial(ctx, id) {
  return ctx.repos.serialNumbers.get(id);
}

/**
 * Serial yang tersedia untuk produk & unit tertentu (untuk pilih di kasir).
 */
export async function getAvailableSerials(ctx, productId, unitId) {
  const all = await ctx.repos.serialNumbers.listByIndex('by_product', productId);
  return all.filter((s) => s.status === SERIAL_STATUS.IN_STOCK && s.unitId === unitId);
}

/** Ambil semua serial yang terjual dalam sale tertentu. */
export async function getSerialsForSale(ctx, saleId) {
  return ctx.repos.serialNumbers.listByIndex('by_sale', saleId);
}

/** Cek duplikat (untuk validasi input). */
async function ensureUniqueSerial(ctx, serial, excludeId = '') {
  const existing = await ctx.repos.serialNumbers.findByIndex('by_serial', String(serial).trim());
  if (existing && existing.id !== excludeId) {
    throw new Error(`Serial "${serial}" sudah terdaftar (produk: ${existing.productId})`);
  }
}

/* ===================== CREATE ===================== */

/**
 * Tambah 1 serial baru (stok masuk manual atau koreksi).
 * 
 * @param {object} ctx
 * @param {{
 *   productId: string,
 *   unitId: string,
 *   serial: string,
 *   purchasePrice?: number,
 *   purchaseId?: string,
 *   purchaseDate?: number,
 *   notes?: string,
 * }} data
 */
export async function addSerial(ctx, data) {
  const payload = createSerialNumber({
    id: newId(),
    productId: data.productId,
    unitId: data.unitId,
    serial: String(data.serial || '').trim(),
    status: SERIAL_STATUS.IN_STOCK,
    purchasePrice: Math.max(0, Math.round(Number(data.purchasePrice) || 0)),
    purchaseId: data.purchaseId || '',
    purchaseDate: data.purchaseDate || Date.now(),
    notes: data.notes || '',
  });
  validateSerialNumber(payload);
  await ensureUniqueSerial(ctx, payload.serial);

  await ctx.repos.serialNumbers.save(payload);

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_ADD,
    details: {
      serial: payload.serial,
      productId: payload.productId,
      purchasePrice: payload.purchasePrice,
    },
  });

  return payload;
}

/**
 * Tambah banyak serial sekaligus (stock-in massal).
 * Validasi semua dulu, baru simpan atomik.
 * 
 * @param {object} ctx
 * @param {{ productId: string, unitId: string, serials: string[], purchasePrice?: number, purchaseId?: string }} data
 * @returns {Promise<object[]>}
 */
export async function addSerialsBulk(ctx, data) {
  const serials = (data.serials || []).map((s) => String(s).trim()).filter(Boolean);

  if (serials.length === 0) throw new Error('Tidak ada serial yang diinput');

  // Cek duplikat internal
  const seen = new Set();
  for (const s of serials) {
    if (seen.has(s)) throw new Error(`Serial "${s}" duplikat dalam input`);
    seen.add(s);
  }

  // Cek duplikat eksternal
  for (const s of serials) {
    await ensureUniqueSerial(ctx, s);
  }

  const records = serials.map((s) => createSerialNumber({
    id: newId(),
    productId: data.productId,
    unitId: data.unitId,
    serial: s,
    status: SERIAL_STATUS.IN_STOCK,
    purchasePrice: Math.max(0, Math.round(Number(data.purchasePrice) || 0)),
    purchaseId: data.purchaseId || '',
    purchaseDate: Date.now(),
  }));
  records.forEach(validateSerialNumber);

  await ctx.repos.serialNumbers.saveMany(records);

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_ADD,
    details: {
      productId: data.productId,
      count: records.length,
      serials: serials.slice(0, 10),
    },
  });

  return records;
}

/* ===================== STATUS TRANSITION ===================== */

/**
 * Mark serial as SOLD (dipanggil dari sale-service setelah sale final).
 * @param {object} ctx
 * @param {string[]} serialIds
 * @param {{
 *   saleId: string,
 *   soldAt: number,
 *   soldPrice: number,
 *   customerId?: string|null,
 *   customerName?: string,
 *   warrantyMonths?: number,
 * }} info
 */
export async function markSerialsSold(ctx, serialIds, info) {
  const now = info.soldAt || Date.now();
  const warrantyUntil = info.warrantyMonths && info.warrantyMonths > 0
    ? now + info.warrantyMonths * 30 * 24 * 3600 * 1000
    : 0;

  for (const id of serialIds) {
    const s = await ctx.repos.serialNumbers.get(id);
    if (!s) continue;
    if (s.status !== SERIAL_STATUS.IN_STOCK) {
      throw new Error(`Serial "${s.serial}" tidak dalam status tersedia`);
    }
    await ctx.repos.serialNumbers.patch(id, {
      status: SERIAL_STATUS.SOLD,
      soldSaleId: info.saleId,
      soldAt: now,
      soldPrice: info.soldPrice || 0,
      customerId: info.customerId || null,
      customerName: info.customerName || '',
      warrantyUntil,
    });
  }

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_SOLD,
    details: {
      saleId: info.saleId,
      count: serialIds.length,
      customerName: info.customerName || '',
    },
  });
}

/**
 * Mark serials as VOID / back to in_stock.
 */
export async function markSerialsInStock(ctx, serialIds, reason = '') {
  for (const id of serialIds) {
    const s = await ctx.repos.serialNumbers.get(id);
    if (!s) continue;
    await ctx.repos.serialNumbers.patch(id, {
      status: SERIAL_STATUS.IN_STOCK,
      soldSaleId: '',
      soldAt: 0,
      soldPrice: 0,
      customerId: null,
      customerName: '',
      warrantyUntil: 0,
      notes: s.notes + (reason ? ` [${reason}]` : ''),
    });
  }
  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_VOID,
    details: { count: serialIds.length, reason },
  });
}

/**
 * Mark serials as RETURNED.
 */
export async function markSerialsReturned(ctx, serialIds, reason = '') {
  for (const id of serialIds) {
    const s = await ctx.repos.serialNumbers.get(id);
    if (!s) continue;
    await ctx.repos.serialNumbers.patch(id, {
      status: SERIAL_STATUS.RETURNED,
      notes: s.notes + (reason ? ` [Retur: ${reason}]` : ''),
    });
  }
  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_RETURNED,
    details: { count: serialIds.length, reason },
  });
}

/**
 * Mark 1 serial as DAMAGED.
 */
export async function markSerialDamaged(ctx, id, reason = '') {
  const s = await ctx.repos.serialNumbers.get(id);
  if (!s) throw new Error('Serial tidak ditemukan');
  await ctx.repos.serialNumbers.patch(id, {
    status: SERIAL_STATUS.DAMAGED,
    notes: s.notes + (reason ? ` [Rusak: ${reason}]` : ''),
  });
  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_DAMAGED,
    details: { serial: s.serial, reason },
  });
}

/**
 * Update metadata serial (harga beli, catatan, dll).
 */
export async function updateSerial(ctx, id, fields) {
  const s = await ctx.repos.serialNumbers.get(id);
  if (!s) throw new Error('Serial tidak ditemukan');

  const patch = {};
  if (fields.purchasePrice !== undefined) patch.purchasePrice = Math.max(0, Math.round(Number(fields.purchasePrice) || 0));
  if (fields.notes !== undefined) patch.notes = String(fields.notes);

  return ctx.repos.serialNumbers.patch(id, patch);
}

/**
 * Hapus serial (hanya boleh kalau status in_stock atau damaged).
 */
export async function deleteSerial(ctx, id) {
  const s = await ctx.repos.serialNumbers.get(id);
  if (!s) throw new Error('Serial tidak ditemukan');
  if (s.status === SERIAL_STATUS.SOLD) {
    throw new Error('Tidak bisa hapus serial yang sudah terjual. Lakukan retur/void terlebih dahulu');
  }
  await ctx.repos.serialNumbers.softDelete(id);
  await logAudit(ctx, {
    action: AUDIT_ACTIONS.SERIAL_DELETED,
    details: { serial: s.serial },
  });
}

/* ===================== STATS ===================== */

/**
 * Statistik serial per produk.
 * @param {object} ctx
 * @param {string} productId
 */
export async function getSerialStats(ctx, productId) {
  const all = await ctx.repos.serialNumbers.listByIndex('by_product', productId);
  const stats = {
    total: all.length,
    in_stock: 0,
    sold: 0,
    returned: 0,
    damaged: 0,
  };
  for (const s of all) {
    if (s.status in stats) stats[s.status] += 1;
  }
  return stats;
}

/**
 * Ambil semua serial untuk 1 produk (untuk halaman detail produk).
 */
export async function listSerialsForProduct(ctx, productId) {
  return ctx.repos.serialNumbers.listByIndex('by_product', productId);
}