/**
 * src/core/schema.js
 * Skema DB v7 — menambah tabel batches untuk FEFO tracking.
 */

export const DB_NAME = 'kasir';
export const DB_VERSION = 7;

export const STORES = [
  { name: 'meta', keyPath: 'key' },
  { name: 'settings', keyPath: 'key' },
  {
    name: 'users', keyPath: 'id',
    indexes: [
      { name: 'by_username', keyPath: 'username', unique: true },
      { name: 'by_role', keyPath: 'role' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'products', keyPath: 'id',
    indexes: [
      { name: 'by_sku', keyPath: 'sku' },
      { name: 'by_category', keyPath: 'category' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'units', keyPath: 'id',
    indexes: [
      { name: 'by_product', keyPath: 'productId' },
      { name: 'by_barcode', keyPath: 'barcode' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'customers', keyPath: 'id',
    indexes: [
      { name: 'by_phone', keyPath: 'phone' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  { name: 'suppliers', keyPath: 'id', indexes: [{ name: 'by_updatedAt', keyPath: 'updatedAt' }] },
  {
    name: 'discounts', keyPath: 'id',
    indexes: [
      { name: 'by_scope', keyPath: 'scope' },
      { name: 'by_target', keyPath: 'targetId' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'sales', keyPath: 'id',
    indexes: [
      { name: 'by_number', keyPath: 'number' },
      { name: 'by_customer', keyPath: 'customerId' },
      { name: 'by_shift', keyPath: 'shiftId' },
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'stockMovements', keyPath: 'id',
    indexes: [
      { name: 'by_product', keyPath: 'productId' },
      { name: 'by_ref', keyPath: ['refType', 'refId'] },
      { name: 'by_type', keyPath: 'type' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'shifts', keyPath: 'id',
    indexes: [
      { name: 'by_cashier', keyPath: 'cashierId' },
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'salesOrders', keyPath: 'id',
    indexes: [
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_customer', keyPath: 'customerId' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'auditLogs', keyPath: 'id',
    indexes: [
      { name: 'by_at', keyPath: 'at' },
      { name: 'by_action', keyPath: 'action' },
      { name: 'by_user', keyPath: 'userId' },
    ],
  },
  {
    name: 'serialNumbers', keyPath: 'id',
    indexes: [
      { name: 'by_serial', keyPath: 'serial', unique: true },
      { name: 'by_product', keyPath: 'productId' },
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_sale', keyPath: 'soldSaleId' },
      { name: 'by_customer', keyPath: 'customerId' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  {
    name: 'selfOrders', keyPath: 'id',
    indexes: [
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_table', keyPath: 'tableNumber' },
      { name: 'by_submittedAt', keyPath: 'submittedAt' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
  // ===== BARU: Batch / Expired =====
  {
    name: 'batches', keyPath: 'id',
    indexes: [
      { name: 'by_product', keyPath: 'productId' },
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_expiry', keyPath: 'expiryDate' },
      { name: 'by_supplier', keyPath: 'supplierId' },
      { name: 'by_updatedAt', keyPath: 'updatedAt' },
    ],
  },
];

export const STORE_NAMES = new Set(STORES.map((s) => s.name));

export function migrate(db, tx) {
  for (const def of STORES) {
    let store;
    if (!db.objectStoreNames.contains(def.name)) {
      store = db.createObjectStore(def.name, { keyPath: def.keyPath });
    } else {
      store = tx.objectStore(def.name);
    }
    for (const idx of def.indexes || []) {
      if (!store.indexNames.contains(idx.name)) {
        store.createIndex(idx.name, idx.keyPath, {
          unique: !!idx.unique,
          multiEntry: !!idx.multiEntry,
        });
      }
    }
  }
}