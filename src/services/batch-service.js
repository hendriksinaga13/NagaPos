/**
 * src/services/batch-service.js
 * Manajemen batch / lot + FEFO.
 */

import { newId } from '../core/id.js';
import { idbReq } from '../core/db.js';
import {
  createBatch, validateBatch,
  BATCH_STATUS, daysToExpiry, expirySeverity,
} from '../models/batch.js';
import { logAudit } from './audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';

/* ============ BATCAH NUMBER ============ */

function generateBatchNumber() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BATCH-${ts}-${rand}`;
}

/* ============ CREATE ============ */

export async function createBatchRecord(ctx, data) {
  const batch = createBatch({
    id: newId(),
    productId: data.productId,
    batchNumber: data.batchNumber || generateBatchNumber(),
    qtyBase: Math.max(0, Number(data.qtyBase) || 0),
    initialQtyBase: Math.max(0, Number(data.qtyBase) || 0),
    costPerBase: Math.max(0, Math.round(Number(data.costPerBase) || 0)),
    purchaseUnitId: data.purchaseUnitId || '',
    purchaseQty: Number(data.purchaseQty) || 0,
    supplierId: data.supplierId || '',
    purchaseId: data.purchaseId || '',
    expiryDate: Number(data.expiryDate) || 0,
    receivedAt: data.receivedAt || Date.now(),
    status: BATCH_STATUS.ACTIVE,
    notes: data.notes || '',
  });
  validateBatch(batch);

  await ctx.repos.batches.save(batch);

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.BATCH_CREATE,
    details: {
      batchNumber: batch.batchNumber,
      productId: batch.productId,
      qtyBase: batch.qtyBase,
      expiryDate: batch.expiryDate,
    },
  });

  return batch;
}

/* ============ READ ============ */

export async function listBatchesByProduct(ctx, productId, activeOnly = true) {
  let batches = await ctx.repos.batches.listByIndex('by_product', productId);
  if (activeOnly) {
    batches = batches.filter((b) => b.status === BATCH_STATUS.ACTIVE && b.qtyBase > 0);
  }
  batches.sort((a, b) => {
    const ea = a.expiryDate || Number.MAX_SAFE_INTEGER;
    const eb = b.expiryDate || Number.MAX_SAFE_INTEGER;
    return ea - eb;
  });
  return batches;
}

export async function listBatches(ctx, opts = {}) {
  const {
    productId = '', status = '', supplierId = '',
    expiryBefore, expiryAfter, severity,
  } = opts;

  let list = await ctx.repos.batches.list();

  if (productId) list = list.filter((b) => b.productId === productId);
  if (status) list = list.filter((b) => b.status === status);
  if (supplierId) list = list.filter((b) => b.supplierId === supplierId);
  if (expiryBefore) list = list.filter((b) => b.expiryDate > 0 && b.expiryDate < expiryBefore);
  if (expiryAfter) list = list.filter((b) => b.expiryDate > expiryAfter);

  if (severity) {
    list = list.filter((b) => {
      if (b.status !== BATCH_STATUS.ACTIVE) return false;
      if (b.qtyBase <= 0) return false;
      return expirySeverity(b) === severity;
    });
  }

  list.sort((a, b) => {
    const ea = a.expiryDate || Number.MAX_SAFE_INTEGER;
    const eb = b.expiryDate || Number.MAX_SAFE_INTEGER;
    return ea - eb;
  });

  return list;
}

export async function getBatchSummary(ctx, productId) {
  const batches = await ctx.repos.batches.listByIndex('by_product', productId);
  const active = batches.filter((b) => b.status === BATCH_STATUS.ACTIVE && b.qtyBase > 0);
  let totalQtyBase = 0;
  let expiredCount = 0;
  let nearExpiryCount = 0;
  let earliestExpiry = 0;

  for (const b of active) {
    totalQtyBase += b.qtyBase;
    const sev = expirySeverity(b);
    if (sev === 'expired') expiredCount++;
    else if (sev === 'critical') nearExpiryCount++;
    if (b.expiryDate > 0) {
      if (!earliestExpiry || b.expiryDate < earliestExpiry) earliestExpiry = b.expiryDate;
    }
  }

  return { batchCount: active.length, totalQtyBase, expiredCount, nearExpiryCount, earliestExpiry };
}

/* ============ FEFO — TRANSACTION FUNCTIONS ============ */

/**
 * Deduct FEFO di dalam transaction. Writes ke batches store.
 * Return allocations yang dipakai.
 * 
 * @param {IDBTransaction} tx
 * @param {string} productId
 * @param {number} qtyBase
 * @returns {Promise<BatchAllocation[]>}
 */
export async function deductFEFOInTx(tx, productId, qtyBase) {
  const store = tx.objectStore('batches');
  const index = store.index('by_product');
  const allBatches = await idbReq(index.getAll(productId));

  const active = allBatches
    .filter((b) => !b.deleted && b.status === BATCH_STATUS.ACTIVE && b.qtyBase > 0)
    .sort((a, b) => {
      const ea = a.expiryDate || Number.MAX_SAFE_INTEGER;
      const eb = b.expiryDate || Number.MAX_SAFE_INTEGER;
      return ea - eb;
    });

  let remaining = qtyBase;
  const allocations = [];

  for (const b of active) {
    if (remaining <= 0) break;
    const take = Math.min(b.qtyBase, remaining);
    if (take > 0) {
      allocations.push({
        batchId: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        qty: take,
      });
      remaining -= take;
    }
  }

  if (remaining > 0) {
    throw new Error(`Stok batch tidak cukup untuk produk ${productId} (kurang ${remaining})`);
  }

  for (const alloc of allocations) {
    const batch = await idbReq(store.get(alloc.batchId));
    if (!batch) throw new Error(`Batch ${alloc.batchId} hilang`);
    const newQty = batch.qtyBase - alloc.qty;
    await idbReq(store.put({
      ...batch,
      qtyBase: newQty,
      status: newQty <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE,
      updatedAt: Date.now(),
    }));
  }

  return allocations;
}

/**
 * Restore semua allocations (untuk void).
 * @param {IDBTransaction} tx
 * @param {BatchAllocation[]} allocations
 */
export async function restoreFEFOInTx(tx, allocations) {
  if (!allocations || !allocations.length) return;
  const store = tx.objectStore('batches');
  for (const alloc of allocations) {
    const batch = await idbReq(store.get(alloc.batchId));
    if (!batch) { console.warn('[batch] restore ke batch hilang:', alloc.batchId); continue; }
    await idbReq(store.put({
      ...batch,
      qtyBase: batch.qtyBase + alloc.qty,
      status: BATCH_STATUS.ACTIVE,
      updatedAt: Date.now(),
    }));
  }
}

/**
 * Restore parsial (untuk retur). Kembalikan qty dihitung dari allocation terakhir.
 * @param {IDBTransaction} tx
 * @param {BatchAllocation[]} allocations
 * @param {number} qtyBaseToRestore
 */
export async function restorePartialFEFOInTx(tx, allocations, qtyBaseToRestore) {
  if (!allocations || !allocations.length || qtyBaseToRestore <= 0) return;
  const store = tx.objectStore('batches');
  let remaining = qtyBaseToRestore;

  for (let i = allocations.length - 1; i >= 0 && remaining > 0; i--) {
    const alloc = allocations[i];
    const take = Math.min(alloc.qty, remaining);
    if (take <= 0) continue;
    const batch = await idbReq(store.get(alloc.batchId));
    if (batch) {
      await idbReq(store.put({
        ...batch,
        qtyBase: batch.qtyBase + take,
        status: BATCH_STATUS.ACTIVE,
        updatedAt: Date.now(),
      }));
    }
    remaining -= take;
  }
}

/* ============ PUBLIC: ALLOCATE (PRE-CHECK) ============ */

export async function allocateFEFO(ctx, productId, qtyBase) {
  const need = Number(qtyBase) || 0;
  if (need <= 0) return [];

  const batches = await listBatchesByProduct(ctx, productId, true);
  const total = batches.reduce((sum, b) => sum + b.qtyBase, 0);
  if (total < need) {
    throw new Error(`Stok batch tidak cukup. Diminta ${need} base, tersedia ${total}.`);
  }

  const allocations = [];
  let remaining = need;
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.qtyBase, remaining);
    if (take > 0) {
      allocations.push({
        batchId: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        qty: take,
      });
      remaining -= take;
    }
  }
  return allocations;
}

/* ============ ADJUST / DAMAGED / DELETE ============ */

export async function adjustBatchQty(ctx, batchId, { newQtyBase, reason = '' }) {
  const batch = await ctx.repos.batches.get(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');

  const newQty = Math.max(0, Math.round(Number(newQtyBase) || 0));
  if (newQty === batch.qtyBase) throw new Error('Qty sama dengan sebelumnya');

  await ctx.repos.batches.patch(batchId, {
    qtyBase: newQty,
    status: newQty <= 0 ? BATCH_STATUS.DEPLETED : BATCH_STATUS.ACTIVE,
    notes: batch.notes + (reason ? ` [Koreksi: ${reason}]` : ''),
  });

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.BATCH_ADJUST,
    details: { batchNumber: batch.batchNumber, oldQty: batch.qtyBase, newQty, reason },
  });
}

export async function markBatchDamaged(ctx, batchId, reason = '') {
  const batch = await ctx.repos.batches.get(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  await ctx.repos.batches.patch(batchId, {
    qtyBase: 0,
    status: BATCH_STATUS.EXPIRED,
    notes: batch.notes + (reason ? ` [Rusak: ${reason}]` : ''),
  });
  await logAudit(ctx, {
    action: AUDIT_ACTIONS.BATCH_DAMAGED,
    details: { batchNumber: batch.batchNumber, reason },
  });
}

export async function deleteBatch(ctx, batchId) {
  const batch = await ctx.repos.batches.get(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.qtyBase > 0) throw new Error('Tidak bisa hapus batch yang masih ada stok');
  await ctx.repos.batches.softDelete(batchId);
  await logAudit(ctx, {
    action: AUDIT_ACTIONS.BATCH_DELETED,
    details: { batchNumber: batch.batchNumber },
  });
}

/* ============ EXPIRY MONITOR ============ */

export async function listExpiringBatches(ctx, opts = {}) {
  const { withinDays = 90 } = opts;
  const now = Date.now();
  const threshold = now + withinDays * 24 * 3600 * 1000;

  const allBatches = await ctx.repos.batches.listByIndex('by_status', BATCH_STATUS.ACTIVE);
  const relevant = allBatches.filter((b) => b.expiryDate > 0 && b.expiryDate <= threshold && b.qtyBase > 0);

  const products = new Map();
  const units = new Map();
  const result = [];

  for (const b of relevant) {
    if (!products.has(b.productId)) {
      const p = await ctx.repos.products.get(b.productId);
      if (p) products.set(b.productId, p);
    }
    const product = products.get(b.productId);
    if (!product) continue;

    let unitName = 'base';
    if (product.baseUnitId) {
      if (!units.has(product.baseUnitId)) {
        const u = await ctx.repos.units.get(product.baseUnitId);
        if (u) units.set(product.baseUnitId, u);
      }
      const u = units.get(product.baseUnitId);
      if (u) unitName = u.name;
    }

    result.push({
      batch: b,
      product,
      unitName,
      days: daysToExpiry(b, now),
      severity: expirySeverity(b, now),
    });
  }

  result.sort((a, b) => a.days - b.days);
  return result;
}

export async function getExpiryStats(ctx) {
  const now = Date.now();
  const active = await ctx.repos.batches.listByIndex('by_status', BATCH_STATUS.ACTIVE);

  let expired = 0;
  let critical = 0;
  let warning = 0;
  let totalQtyExpiring = 0;

  for (const b of active) {
    if (b.qtyBase <= 0) continue;
    const sev = expirySeverity(b, now);
    if (sev === 'expired') { expired++; totalQtyExpiring += b.qtyBase; }
    else if (sev === 'critical') { critical++; totalQtyExpiring += b.qtyBase; }
    else if (sev === 'warning') { warning++; }
  }

  return { expired, critical, warning, totalQtyExpiring };
}