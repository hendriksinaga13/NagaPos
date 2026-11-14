/**
 * src/sync/supabase.js
 * Klien minimal Supabase Storage (REST) untuk snapshot DB & Sales Order.
 */

export class SupabaseStorage {
  constructor({ url, anonKey, bucket, path }) {
    this.url = String(url || '').replace(/\/+$/, '');
    this.anonKey = String(anonKey || '');
    this.bucket = String(bucket || 'kasir-db');
    this.path = String(path || 'snapshot.db');
  }

  _validate() {
    if (!this.url) throw new Error('URL Supabase kosong');
    if (!this.anonKey) throw new Error('Anon key kosong');
    if (!this.bucket) throw new Error('Bucket kosong');
  }

  _headers(extra = {}) {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      ...extra,
    };
  }

  _objectUrl(path = this.path) {
    this._validate();
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${this.url}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodedPath}`;
  }

  async test() {
    const res = await fetch(this._objectUrl(), {
      method: 'GET',
      headers: this._headers({ 'cache-control': 'no-cache' }),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Anon key ditolak');
    if (res.status === 400) throw new Error('Bucket atau path tidak valid');
    if (!res.ok && res.status !== 404) throw new Error(`Gagal akses storage (${res.status})`);
    return true;
  }

  async getSnapshot() {
    const res = await fetch(this._objectUrl(), { method: 'GET', headers: this._headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gagal unduh snapshot (${res.status})`);
    return await res.json();
  }

  async putSnapshot(snapshot) {
    const res = await fetch(this._objectUrl(), {
      method: 'POST',
      headers: this._headers({ 'content-type': 'application/json', 'x-upsert': 'true' }),
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`Gagal unggah snapshot (${res.status})`);
    return true;
  }

  /* ===================== SALES ORDER SYNC ===================== */

  async uploadSO(so) {
    const path = `sales-orders/${so.id}.json`;
    const res = await fetch(this._objectUrl(path), {
      method: 'POST',
      headers: this._headers({ 'content-type': 'application/json', 'x-upsert': 'true' }),
      body: JSON.stringify(so),
    });
    if (!res.ok) throw new Error(`Gagal unggah SO (${res.status})`);
    return true;
  }

  async listSOs() {
    const url = `${this.url}/storage/v1/object/list/${encodeURIComponent(this.bucket)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefix: 'sales-orders/', limit: 100, offset: 0 }),
    });
    if (!res.ok) return [];
    return await res.json();
  }

  async downloadSO(name) {
    const path = `sales-orders/${name}`;
    const res = await fetch(this._objectUrl(path), { method: 'GET', headers: this._headers() });
    if (!res.ok) throw new Error(`Gagal unduh SO (${res.status})`);
    return await res.json();
  }

  async deleteSO(name) {
    const path = `sales-orders/${name}`;
    const res = await fetch(this._objectUrl(path), { method: 'DELETE', headers: this._headers() });
    if (!res.ok && res.status !== 404) throw new Error(`Gagal hapus SO (${res.status})`);
    return true;
  }
}