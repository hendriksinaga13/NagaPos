/**
 * src/sync/sync-manager.js
 * Orkestrasi sinkronisasi dua arah (pull-merge-push) ke Supabase Storage.
 */

import { SupabaseStorage } from './supabase.js';
import { markPending, clearPending } from './sync-queue.js';
import { mergeRemoteIntoLocal } from './conflict.js';
import { exportSnapshot } from '../core/dbfile.js';

function slug(str) {
  return String(str || 'toko')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'toko';
}

export class SyncManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.supabase = null;
    this.enabled = false;
    this.intervalMs = 60000;

    this.syncing = false;
    this.state = 'off';
    this.lastSyncAt = 0;
    this.lastError = '';

    this._subs = new Set();
    this._timer = null;
    this._debounce = null;
    this._hooked = false;

    this._onOnline = () => this._handleOnline();
    this._onOffline = () => this._emit();
  }

  init() {
    if (this._hooked) return;
    this._installWriteHook();
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
    this._applySettings(this.ctx.settings);
    this._schedule();
    if (this.enabled) {
      setTimeout(() => this.syncNow().catch(() => {}), 2000);
    }
    this._emit();
  }

  destroy() {
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._debounce) { clearTimeout(this._debounce); this._debounce = null; }
  }

  reload(settings) {
    this._applySettings(settings || this.ctx.settings);
    this._schedule();
    this._emit();
  }

  subscribe(fn) {
    this._subs.add(fn);
    fn(this.getState());
    return () => this._subs.delete(fn);
  }

  getState() {
    return {
      enabled: this.enabled,
      online: navigator.onLine !== false,
      syncing: this.syncing,
      state: this.state,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  async testConnection() {
    if (!this.supabase) throw new Error('Konfigurasi belum lengkap');
    return this.supabase.test();
  }

  async syncNow() {
    if (!this.enabled) throw new Error('Sync belum diaktifkan');
    if (navigator.onLine === false) throw new Error('Sedang offline');
    if (this.syncing) return { busy: true };

    this.syncing = true;
    this.state = 'syncing';
    this.lastError = '';
    this._emit();

    try {
      const remote = await this.supabase.getSnapshot();
      let imported = 0;
      let skipped = 0;
      if (remote) {
        const r = await mergeRemoteIntoLocal(this.ctx.db, remote);
        imported = r.imported;
        skipped = r.skipped;
      }

      const local = await exportSnapshot(this.ctx.db);
      await this.supabase.putSnapshot(local);

      await clearPending(this.ctx.repos.settings);
      this.lastSyncAt = Date.now();
      this.state = 'idle';
      return { imported, skipped, pushed: true };
    } catch (e) {
      // PERBAIKAN: Gunakan optional chaining (e?.message)
      this.lastError = e?.message || String(e) || 'Unknown sync error';
      this.state = 'error';
      throw new Error(this.lastError);
    } finally {
      this.syncing = false;
      this._emit();
    }
  }

  async touch() {
    if (!this.enabled) return;
    if (this.syncing) return;
    await markPending(this.ctx.repos.settings);
    if (navigator.onLine !== false) {
      if (this._debounce) clearTimeout(this._debounce);
      this._debounce = setTimeout(() => { this.syncNow().catch(() => {}); }, 3000);
    }
  }

  _applySettings(settings) {
    const s = settings || {};
    const url = String(s.syncSupabaseUrl || '').trim();
    const key = String(s.syncSupabaseAnonKey || '').trim();
    const bucket = String(s.syncBucket || 'kasir-db').trim();
    const path = String(s.syncPath || '').trim() || `${slug(s.storeName || 'toko')}.db`;

    this.enabled = !!s.syncEnabled && !!url && !!key;
    this.intervalMs = Math.max(15000, Number(s.syncIntervalMs) || 60000);

    this.supabase = this.enabled ? new SupabaseStorage({ url, anonKey: key, bucket, path }) : null;

    if (!this.enabled) this.state = 'off';
    else if (this.state === 'off') this.state = 'idle';
  }

  _schedule() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (!this.enabled) return;
    this._timer = setInterval(() => { this.syncNow().catch(() => {}); }, this.intervalMs);
  }

  _handleOnline() {
    this._emit();
    if (this.enabled) this.syncNow().catch(() => {});
  }

  _installWriteHook() {
    if (this._hooked) return;
    const db = this.ctx.db;
    const origPut = db.put.bind(db);
    const origPutMany = db.putMany.bind(db);

    db.put = async (store, val) => {
      const r = await origPut(store, val);
      this.touch();
      return r;
    };
    db.putMany = async (store, vals) => {
      const r = await origPutMany(store, vals);
      this.touch();
      return r;
    };
    this._hooked = true;
  }

  _emit() {
    const s = this.getState();
    for (const fn of this._subs) {
      try { fn(s); } catch { /* noop */ }
    }
  }
}