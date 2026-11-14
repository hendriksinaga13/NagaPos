import { DB_NAME, DB_VERSION, migrate } from './schema.js';

export class Database {
  constructor(name = DB_NAME, version = DB_VERSION) {
    this.name = name;
    this.version = version;
    this._db = null;
    this._opening = null;
  }

  open() {
    if (this._db) return Promise.resolve(this._db);
    if (this._opening) return this._opening;

    this._opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = req.transaction;
        try {
          migrate(db, tx, event.oldVersion, event.newVersion || this.version);
        } catch (err) {
          console.error('[db] migrasi gagal', err);
          try { tx.abort(); } catch { /* noop */ }
          reject(err);
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        this._db.onversionchange = () => {
          try { this._db.close(); } catch { /* noop */ }
          this._db = null;
          this._opening = null;
        };
        resolve(this._db);
      };

      req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB'));
      req.onblocked = () => console.warn('[db] upgrade terblokir oleh tab lain.');
    });

    return this._opening;
  }

  close() {
    if (this._db) { try { this._db.close(); } catch { /* noop */ } }
    this._db = null;
    this._opening = null;
  }

  async get(store, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(req.error || new Error('DB read error'));
    });
  }

  async getAll(store) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('DB read error'));
    });
  }

  async put(store, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('DB write error'));
      tx.onabort = () => reject(tx.error || new Error('DB transaction aborted'));
    });
  }

  async putMany(store, values) {
    if (!values.length) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const v of values) os.put(v);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('DB putMany failed'));
      tx.onabort = () => reject(tx.error || new Error('DB putMany aborted'));
    });
  }

  async delete(store, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('DB delete error'));
      tx.onabort = () => reject(tx.error || new Error('DB delete aborted'));
    });
  }

  async clear(store) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('DB clear error'));
      tx.onabort = () => reject(tx.error || new Error('DB clear aborted'));
    });
  }

  async getAllByIndex(store, index, query) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).index(index).getAll(query);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('DB index read error'));
    });
  }

  async getOneByIndex(store, index, query) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).index(index).get(query);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(req.error || new Error('DB index read error'));
    });
  }

  async withTransaction(stores, mode, fn) {
    const db = await this.open();
    const tx = db.transaction(stores, mode);

    let doneResolve, doneReject;
    const done = new Promise((res, rej) => { doneResolve = res; doneReject = rej; });
    
    tx.oncomplete = () => doneResolve();
    tx.onerror = () => doneReject(tx.error || new Error('DB transaction error'));
    tx.onabort = () => doneReject(tx.error || new Error('DB transaction aborted'));

    let result;
    try {
      result = await fn(tx);
    } catch (err) {
      try { tx.abort(); } catch { /* noop */ }
      try { await done; } catch { /* noop */ }
      throw err;
    }
    await done;
    return result;
  }
}

let _instance = null;
export function getDb() {
  if (!_instance) _instance = new Database();
  return _instance;
}

export function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB Request failed'));
  });
}