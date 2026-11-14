import { newId } from './id.js';
import { getDb } from './db.js';

export class Repository {
  constructor(db, storeName, { keyPath = 'id', autoId = true } = {}) {
    this.db = db; this.storeName = storeName; this.keyPath = keyPath; this.autoId = autoId;
  }
  async get(id) { const rec = await this.db.get(this.storeName, id); return rec && !rec.deleted ? rec : undefined; }
  async getRaw(id) { return this.db.get(this.storeName, id); }
  async list() { const all = await this.db.getAll(this.storeName); return all.filter((r) => !r.deleted); }
  async listAll() { return this.db.getAll(this.storeName); }
  async listByIndex(indexName, query) { const all = await this.db.getAllByIndex(this.storeName, indexName, query); return all.filter((r) => !r.deleted); }
  async findByIndex(indexName, query) { const rec = await this.db.getOneByIndex(this.storeName, indexName, query); return rec && !rec.deleted ? rec : undefined; }
  async findOne(predicate) { const list = await this.list(); return list.find(predicate); }
  async filter(predicate) { const list = await this.list(); return list.filter(predicate); }
  async save(record) {
    const now = Date.now(); const r = record;
    if (this.autoId && !r[this.keyPath]) r[this.keyPath] = newId();
    if (!r[this.keyPath]) throw new Error(`[repo] key kosong`);
    if (!r.createdAt) r.createdAt = now;
    r.updatedAt = now;
    if (r.deleted === undefined) r.deleted = false;
    await this.db.put(this.storeName, r); return r;
  }
  async saveMany(records) {
    if (!records.length) return [];
    const now = Date.now();
    const stamped = records.map((rec) => {
      const r = rec;
      if (this.autoId && !r[this.keyPath]) r[this.keyPath] = newId();
      if (!r.createdAt) r.createdAt = now;
      r.updatedAt = now;
      if (r.deleted === undefined) r.deleted = false;
      return r;
    });
    await this.db.putMany(this.storeName, stamped);
    return stamped;
  }
  async patch(id, fields) {
    const existing = await this.getRaw(id);
    if (!existing) throw new Error(`id ${id} tidak ditemukan`);
    const merged = { ...existing, ...fields, updatedAt: Date.now() };
    await this.db.put(this.storeName, merged);
    return merged;
  }
  async softDelete(id) {
    const existing = await this.getRaw(id);
    if (!existing) return undefined;
    const updated = { ...existing, deleted: true, updatedAt: Date.now() };
    await this.db.put(this.storeName, updated);
    return updated;
  }
  async hardDelete(id) { await this.db.delete(this.storeName, id); }
  async bulkUpsert(records) { if (!records || !records.length) return; await this.db.putMany(this.storeName, records); }
}

export class SettingsRepository {
  constructor(db) { this.db = db; this.storeName = 'settings'; }
  async get(key) { const rec = await this.db.get(this.storeName, key); return rec ? rec.value : undefined; }
  async set(key, value) { const rec = { key, value, updatedAt: Date.now() }; await this.db.put(this.storeName, rec); return value; }
  async getAll() { const recs = await this.db.getAll(this.storeName); const out = {}; for (const r of recs) out[r.key] = r.value; return out; }
  async remove(key) { await this.db.delete(this.storeName, key); }
}

export function createRepos(db) {
  return {
    meta: new Repository(db, 'meta', { keyPath: 'key', autoId: false }),
    settings: new SettingsRepository(db),
    users: new Repository(db, 'users'),
    products: new Repository(db, 'products'),
    units: new Repository(db, 'units'),
    customers: new Repository(db, 'customers'),
    suppliers: new Repository(db, 'suppliers'),
    discounts: new Repository(db, 'discounts'),
    sales: new Repository(db, 'sales'),
    stockMovements: new Repository(db, 'stockMovements'),
    shifts: new Repository(db, 'shifts'),
    salesOrders: new Repository(db, 'salesOrders'),
    auditLogs: new Repository(db, 'auditLogs'),
    serialNumbers: new Repository(db, 'serialNumbers'),
    selfOrders: new Repository(db, 'selfOrders'),
    batches: new Repository(db, 'batches'), // <-- BARU
  };
}

let _repos = null;
export function getRepos() { if (!_repos) _repos = createRepos(getDb()); return _repos; }