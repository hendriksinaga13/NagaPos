/**
 * src/services/inventory-service.js
 * Mutasi stok + batch creation otomatis.
 */

import { newId } from '../core/id.js';
import { idbReq } from '../core/db.js';
import { createStockMovement } from '../models/stock.js';
import { createBatch, BATCH_STATUS } from '../models/batch.js';
import { logAudit } from './audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';

const VALID_TYPES = ['in', 'out', 'adjust', 'transfer', 'return', 'void'];

function generateBatchNumber() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BATCH-${ts}-${rand}`;
}

/**
 * Inti: terapkan satu mutasi. Atomik.
 * Kalau batchInfo diberikan & type === 'in', buat batch dalam transaksi yang sama.
 */
export async function applyMovement(ctx, opts) {
  const { db } = ctx;
  const {
    productId, unitId, deltaBase, type, qty, factor,
    refType = '', refId = '', notes = '',
    batchInfo = null,
  } = opts;

  if (!VALID_TYPES.includes(type)) throw new Error('Tipe mutasi tidak valid');
  if (!Number.isFinite(deltaBase)) throw new Error('Delta stok tidak valid');

  const now = Date.now();
  let updatedProduct = null;
  let movement = null;
  let createdBatch = null;

  await db.withTransaction(['products', 'stockMovements', 'batches'], 'readwrite', async (tx) => {
    const pStore = tx.objectStore('products');
    const mStore = tx.objectStore('stockMovements');
    const bStore = tx.objectStore('batches');

    const p = await idbReq(pStore.get(productId));
    if (!p) throw new Error('Produk tidak ditemukan');
    if (p.deleted) throw new Error('Produk sudah dihapus');

    const before = Number(p.stock) || 0;
    const after = before + deltaBase;
    if (after < 0) throw new Error(`Stok tidak cukup. Stok saat ini ${before}`);

    updatedProduct = { ...p, stock: after, updatedAt: now };
    await idbReq(pStore.put(updatedProduct));

    movement = createStockMovement({
      id: newId(),
      productId, unitId, type,
      qty, factor, qtyBase: deltaBase,
      stockAfter: after,
      refType, refId, notes,
      createdAt: now, updatedAt: now, deleted: false,
    });
    await idbReq(mStore.put(movement));

    // Create batch if requested & type === 'in'
    if (batchInfo && type === 'in' && deltaBase > 0) {
      createdBatch = createBatch({
        id: newId(),
        productId,
        batchNumber: batchInfo.batchNumber || generateBatchNumber(),
        qtyBase: deltaBase,
        initialQtyBase: deltaBase,
        costPerBase: batchInfo.costPerBase || 0,
        purchaseUnitId: unitId,
        purchaseQty: qty,
        purchaseId: refId,
        supplierId: batchInfo.supplierId || '',
        expiryDate: Number(batchInfo.expiryDate) || 0,
        receivedAt: now,
        status: BATCH_STATUS.ACTIVE,
        notes: batchInfo.notes || notes || '',
        createdAt: now, updatedAt: now, deleted: false,
      });
      await idbReq(bStore.put(createdBatch));
    }
  });

  if (type === 'in' || type === 'out' || type === 'adjust') {
    const action = type === 'in' ? AUDIT_ACTIONS.STOCK_IN
      : type === 'out' ? AUDIT_ACTIONS.STOCK_OUT
      : AUDIT_ACTIONS.STOCK_ADJUST;
    await logAudit(ctx, {
      action,
      details: {
        productId,
        productName: updatedProduct?.name,
        unitId,
        qty,
        deltaBase,
        stockAfter: updatedProduct?.stock,
        notes: notes || '',
        batchNumber: createdBatch?.batchNumber || '',
        expiryDate: createdBatch?.expiryDate || 0,
      },
    });
  }

  return { movement, product: updatedProduct, batch: createdBatch };
}

/* ============ PUBLIC ============ */

export async function recordStockIn(ctx, { productId, unitId, qty, notes = '', refType = '', refId = '', expiryDate = 0 }) {
  const unit = await ctx.repos.units.get(unitId);
  if (!unit) throw new Error('Satuan tidak ditemukan');
  if (!(qty > 0)) throw new Error('Qty harus > 0');

  const product = await ctx.repos.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan');

  if (product.trackExpiry && !expiryDate) {
    throw new Error('Tanggal expired wajib diisi untuk produk ini');
  }

  const batchInfo = product.trackExpiry ? {
    expiryDate: Number(expiryDate) || 0,
    costPerBase: Math.round(Number(product.cost) || 0),
  } : null;

  return applyMovement(ctx, {
    productId, unitId,
    deltaBase: qty * unit.factor,
    type: 'in',
    qty, factor: unit.factor,
    refType, refId, notes,
    batchInfo,
  });
}

export async function recordStockOut(ctx, { productId, unitId, qty, notes = '', refType = '', refId = '' }) {
  const unit = await ctx.repos.units.get(unitId);
  if (!unit) throw new Error('Satuan tidak ditemukan');
  if (!(qty > 0)) throw new Error('Qty harus > 0');
  return applyMovement(ctx, {
    productId, unitId,
    deltaBase: -(qty * unit.factor),
    type: 'out',
    qty, factor: unit.factor,
    refType, refId, notes,
  });
}

export async function recordOpname(ctx, { productId, newStockBase, notes = '', unitId = null }) {
  const product = await ctx.repos.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan');
  if (!Number.isFinite(newStockBase) || newStockBase < 0) {
    throw new Error('Stok baru tidak valid');
  }
  const unit = unitId
    ? await ctx.repos.units.get(unitId)
    : await ctx.repos.units.findOne((u) => u.productId === productId && u.isBase);
  if (!unit) throw new Error('Satuan dasar tidak ditemukan');

  const delta = newStockBase - Number(product.stock || 0);
  if (delta === 0) throw new Error('Stok baru sama dengan stok saat ini');

  return applyMovement(ctx, {
    productId, unitId: unit.id,
    deltaBase: delta,
    type: 'adjust',
    qty: delta / unit.factor,
    factor: unit.factor,
    notes,
  });
}

/**
 * Pembelian: multi-item, moving average cost, batch creation per item.
 */
export async function recordPurchase(ctx, { supplierId = '', items = [], notes = '' }) {
  const { db, repos } = ctx;
  if (!items.length) throw new Error('Tidak ada item pembelian');

  const now = Date.now();
  const purchaseId = newId();

  const productMap = new Map();
  const unitMap = new Map();
  for (const it of items) {
    if (!it.productId || !it.unitId || !(it.qty > 0) || !(it.costPerUnit >= 0)) {
      throw new Error('Item pembelian tidak valid');
    }
    if (!productMap.has(it.productId)) {
      const p = await repos.products.get(it.productId);
      if (!p) throw new Error(`Produk ${it.productId} tidak ditemukan`);
      if (p.trackExpiry && !it.expiryDate) {
        throw new Error(`Tanggal expired wajib untuk "${p.name}"`);
      }
      productMap.set(it.productId, p);
    }
    if (!unitMap.has(it.unitId)) {
      const u = await repos.units.get(it.unitId);
      if (!u) throw new Error(`Satuan ${it.unitId} tidak ditemukan`);
      unitMap.set(it.unitId, u);
    }
  }

  let totalAmount = 0;
  for (const it of items) totalAmount += Math.round(it.qty * it.costPerUnit);

  await db.withTransaction(['products', 'stockMovements', 'batches'], 'readwrite', async (tx) => {
    const pStore = tx.objectStore('products');
    const mStore = tx.objectStore('stockMovements');
    const bStore = tx.objectStore('batches');

    const acc = new Map();
    for (const it of items) {
      const u = unitMap.get(it.unitId);
      const qtyBase = it.qty * u.factor;
      const costTotal = it.qty * it.costPerUnit;
      const cur = acc.get(it.productId) || { addQtyBase: 0, addCostTotal: 0 };
      cur.addQtyBase += qtyBase;
      cur.addCostTotal += costTotal;
      acc.set(it.productId, cur);
    }

    for (const [pid, a] of acc) {
      const p = productMap.get(pid);
      const oldStock = Number(p.stock) || 0;
      const oldCost = Number(p.cost) || 0;
      const newStock = oldStock + a.addQtyBase;
      const newCost = newStock > 0
        ? Math.round((oldStock * oldCost + a.addCostTotal) / newStock)
        : oldCost;
      await idbReq(pStore.put({ ...p, stock: newStock, cost: newCost, updatedAt: now }));
    }

    const running = new Map();
    for (const [pid, p] of productMap) running.set(pid, Number(p.stock) || 0);

    for (const it of items) {
      const u = unitMap.get(it.unitId);
      const qtyBase = it.qty * u.factor;
      const before = running.get(it.productId) || 0;
      const after = before + qtyBase;
      running.set(it.productId, after);

      await idbReq(mStore.put(createStockMovement({
        id: newId(),
        productId: it.productId,
        unitId: it.unitId,
        type: 'in',
        qty: it.qty,
        factor: u.factor,
        qtyBase,
        stockAfter: after,
        refType: 'purchase',
        refId: purchaseId,
        notes: `Pembelian${supplierId ? ' dari supplier' : ''}${notes ? ': ' + notes : ''}`,
        createdAt: now, updatedAt: now, deleted: false,
      })));

      // Batch creation
      const p = productMap.get(it.productId);
      if (p.trackExpiry) {
        const batch = createBatch({
          id: newId(),
          productId: it.productId,
          batchNumber: generateBatchNumber(),
          qtyBase,
          initialQtyBase: qtyBase,
          costPerBase: Math.round(Number(it.costPerUnit) / u.factor) || 0,
          purchaseUnitId: it.unitId,
          purchaseQty: it.qty,
          purchaseId,
          supplierId,
          expiryDate: Number(it.expiryDate) || 0,
          receivedAt: now,
          status: BATCH_STATUS.ACTIVE,
          notes: notes || '',
          createdAt: now, updatedAt: now, deleted: false,
        });
        await idbReq(bStore.put(batch));
      }
    }
  });

  await logAudit(ctx, {
    action: AUDIT_ACTIONS.STOCK_IN,
    details: {
      type: 'purchase',
      purchaseId,
      supplierId: supplierId || '',
      itemCount: items.length,
      totalAmount,
    },
  });

  return { purchaseId, totalAmount };
}

export async function listLowStock(ctx) {
  const products = await ctx.repos.products.list();
  return products.filter((p) =>
    p.active && Number(p.minStock) > 0 && Number(p.stock) <= Number(p.minStock),
  );
}