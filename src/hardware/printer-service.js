/**
 * src/hardware/printer-service.js
 * Layanan printer global. Menyatukan BluetoothPrinter, build struk,
 * auto-reconnect, dan state yang dipakai navbar & halaman printer.
 *
 * Event publik:
 *   printerService.subscribe((state) => {...});
 *   state = { connected, deviceName, deviceId, lastError }
 */

import { BluetoothPrinter } from './bluetooth.js';
import { buildReceiptBytes, renderReceiptHtml } from './receipt.js';
import { saveAppSettings } from '../models/settings.js';

export class PrinterService {
  /**
   * @param {{ settingsRepo: import('../core/repository.js').SettingsRepository }} ctx
   */
  constructor(ctx) {
    this.settingsRepo = ctx.settingsRepo;
    this.printer = new BluetoothPrinter();
    /** @type {{connected:boolean, deviceName:string, deviceId:string, lastError:string}} */
    this.state = { connected: false, deviceName: '', deviceId: '', lastError: '' };
    /** @type {Set<(s:any) => void>} */ this._subs = new Set();
    /** @type {{ settings: object }} */ this._settingsRef = { settings: {} };

    this.printer.onDisconnect(() => {
      this._update({ connected: false, lastError: 'Koneksi printer terputus' });
    });
  }

  /** @param {object} settings */
  bindSettings(settings) {
    this._settingsRef.settings = settings;
  }

  subscribe(fn) {
    this._subs.add(fn);
    fn({ ...this.state });
    return () => this._subs.delete(fn);
  }

  _update(patch) {
    Object.assign(this.state, patch);
    for (const fn of this._subs) {
      try { fn({ ...this.state }); } catch { /* noop */ }
    }
  }

  /**
   * Hubungkan ke printer baru.
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      const info = await this.printer.requestAndConnect();
      this._update({ connected: true, deviceName: info.name, deviceId: info.id, lastError: '' });

      // Simpan pilihan ke settings.
      await saveAppSettings(this.settingsRepo, {
        printerDeviceId: info.id,
        printerDeviceName: info.name,
      });
      this._settingsRef.settings.printerDeviceId = info.id;
      this._settingsRef.settings.printerDeviceName = info.name;
    } catch (e) {
      this._update({ lastError: e.message || 'Gagal menyambung printer' });
      throw e;
    }
  }

  /**
   * Coba reconnect ke perangkat tersimpan (dipanggil saat startup).
   * @returns {Promise<boolean>}
   */
  async autoReconnect() {
    const id = this._settingsRef.settings?.printerDeviceId;
    if (!id) return false;
    try {
      const ok = await this.printer.reconnect(id);
      if (ok) {
        this._update({
          connected: true,
          deviceId: id,
          deviceName: this._settingsRef.settings.printerDeviceName || 'Printer',
          lastError: '',
        });
      }
      return ok;
    } catch (e) {
      console.warn('[printer] auto-reconnect gagal', e);
      return false;
    }
  }

  async disconnect() {
    await this.printer.disconnect();
    this._update({ connected: false });
  }

  /**
   * Cetak struk satu sale.
   * @param {import('../core/schema.js').Sale} sale
   */
  async printSale(sale) {
    if (!this.printer.isConnected()) throw new Error('Printer belum terhubung');
    const bytes = await buildReceiptBytes(sale, this._settingsRef.settings);
    await this.printer.write(bytes);
  }

  /**
   * Tes cetak — struk contoh.
   */
  async testPrint() {
    if (!this.printer.isConnected()) throw new Error('Printer belum terhubung');
    const now = Date.now();
    const demo = {
      id: 'demo',
      number: 'INV-TEST-' + new Date(now).toISOString().slice(0, 10),
      status: 'paid',
      cashierId: 'tester',
      items: [
        {
          productName: 'Produk Contoh', unitName: 'pcs', factor: 1,
          qty: 2, pricePerUnit: 5000, subtotal: 10000,
          discountAmount: 0, total: 10000, note: '',
        },
      ],
      payments: [{ method: 'cash', amount: 10000, ref: '', paidAt: now }],
      subtotal: 10000, extraDiscount: 0, discountTotal: 0, taxTotal: 0,
      total: 10000, paidTotal: 10000, change: 0, debtAmount: 0,
      createdAt: now, updatedAt: now, deleted: false,
    };
    await this.printSale(/** @type {any} */ (demo));
  }

  /**
   * Fallback: cetak via browser (window.print) ke printer sistem.
   * @param {import('../core/schema.js').Sale} sale
   */
  printViaBrowser(sale) {
    const html = renderReceiptHtml(sale, this._settingsRef.settings);
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) throw new Error('Popup diblokir. Izinkan popup untuk mencetak.');
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8" /><title>Struk ${sale.number}</title>
      <link rel="stylesheet" href="${location.origin}${new URL('css/base.css', location.href).pathname}" />
      <link rel="stylesheet" href="${location.origin}${new URL('css/receipt-preview.css', location.href).pathname}" />
      <link rel="stylesheet" href="${location.origin}${new URL('css/print.css', location.href).pathname}" media="print" />
      <style>body{margin:0;background:#fff;padding:8px;font-family:ui-monospace,monospace;}</style>
    </head><body>${html}
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
    </body></html>`);
    w.document.close();
  }
}

/** @type {PrinterService|null} */
let _instance = null;

/** @param {{ settingsRepo: any }} ctx */
export function getPrinterService(ctx) {
  if (!_instance) _instance = new PrinterService(ctx);
  return _instance;
}