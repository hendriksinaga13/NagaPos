/**
 * src/hardware/bluetooth.js
 * Wrapper Web Bluetooth (BLE) khusus printer thermal.
 *
 * Karakteristik umum printer BLE (dicoba berurutan):
 *  - 00002af1-... (service 18f0)
 *  - 0000ff02-... (service ff00)
 *  - bef8d6c9-... (service e7810a71)
 *  - 49535343-... (service 49535343)
 *  - Fallback: karakteristik pertama dengan properti write.
 *
 * Semua service UUID didaftarkan pada optionalServices agar bisa
 * diakses setelah requestDevice.
 */

/** @type {{name:string, service:string|null, characteristic:string|null}[]} */
const PRINTER_PROFILES = [
  { name: '18f0',      service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
  { name: 'ff00',      service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
  { name: 'e7810a71',  service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { name: '49535343',  service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
];

const OPTIONAL_SERVICES = PRINTER_PROFILES
  .map((p) => p.service)
  .filter(Boolean);

export class BluetoothPrinter {
  constructor() {
    /** @type {BluetoothDevice|null} */ this.device = null;
    /** @type {BluetoothRemoteGATTCharacteristic|null} */ this.characteristic = null;
    /** @type {BluetoothRemoteGATTServer|null} */ this.server = null;

    this._onDisconnect = () => {
      this.characteristic = null;
      this.server = null;
      if (this._disconnectListener) this._disconnectListener();
    };
    this._disconnectListener = null;
  }

  /** @param {() => void} fn */
  onDisconnect(fn) {
    this._disconnectListener = fn;
  }

  /**
   * Buka dialog pemilihan perangkat, hubungkan, dan temukan karakteristik write.
   * @param {{ acceptAll?: boolean }} [opts]
   * @returns {Promise<{ id: string, name: string }>}
   */
  async requestAndConnect(opts = {}) {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth tidak didukung browser ini. Gunakan Chrome Android/desktop.');
    }

    /** @type {any} */
    const options = opts.acceptAll
      ? { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES }
      : { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES };

    const device = await navigator.bluetooth.requestDevice(options);
    await this._attach(device);
    return { id: device.id, name: device.name || 'Printer' };
  }

  /**
   * Reconnect ke perangkat yang sudah pernah diizinkan (via getDevices()).
   * @param {string} deviceId
   * @returns {Promise<boolean>}
   */
  async reconnect(deviceId) {
    if (!('bluetooth' in navigator)) return false;
    if (typeof navigator.bluetooth.getDevices !== 'function') return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const device = devices.find((d) => d.id === deviceId);
      if (!device) return false;
      await this._attach(device);
      return true;
    } catch (e) {
      console.warn('[ble] reconnect gagal', e);
      return false;
    }
  }

  async _attach(device) {
    this.device = device;
    device.removeEventListener('gattserverdisconnected', this._onDisconnect);
    device.addEventListener('gattserverdisconnected', this._onDisconnect);

    this.server = await device.gatt.connect();

    // Cari karakteristik write dari daftar profil.
    /** @type {BluetoothRemoteGATTCharacteristic|null} */
    let char = null;

    for (const prof of PRINTER_PROFILES) {
      if (!prof.service || !prof.characteristic) continue;
      try {
        const svc = await this.server.getPrimaryService(prof.service);
        char = await svc.getCharacteristic(prof.characteristic);
        if (char && (char.properties.write || char.properties.writeWithoutResponse)) break;
        char = null;
      } catch { /* service tidak ada, coba berikutnya */ }
    }

    // Fallback: enumerasi semua service yang bisa diakses.
    if (!char) {
      try {
        const services = await this.server.getPrimaryServices();
        for (const svc of services) {
          try {
            const chars = await svc.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                char = c;
                break;
              }
            }
            if (char) break;
          } catch { /* skip service ini */ }
        }
      } catch { /* getPrimaryServices butuh izin lebih; abaikan */ }
    }

    if (!char) {
      try { this.server.disconnect(); } catch { /* noop */ }
      throw new Error('Karakteristik write printer tidak ditemukan. Printer mungkin memakai Bluetooth Classic (SPP), bukan BLE.');
    }
    this.characteristic = char;
  }

  /** Putuskan koneksi. */
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      try { this.device.gatt.disconnect(); } catch { /* noop */ }
    }
    this.characteristic = null;
    this.server = null;
  }

  isConnected() {
    return !!(this.device && this.device.gatt && this.device.gatt.connected && this.characteristic);
  }

  /**
   * Kirim bytes ke printer dalam chunk (default 20 byte per BLE write).
   * @param {Uint8Array} data
   * @param {number} [chunkSize]
   */
  async write(data, chunkSize = 20) {
    if (!this.isConnected()) throw new Error('Printer belum terhubung');
    const char = this.characteristic;
    if (!char) throw new Error('Karakteristik printer tidak tersedia');

    const useNoResponse = !!char.properties.writeWithoutResponse;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      if (useNoResponse && char.writeValueWithoutResponse) {
        await char.writeValueWithoutResponse(chunk);
      } else {
        await char.writeValue(chunk);
      }
      // Beri jeda agar buffer printer tidak banjir.
      await new Promise((r) => setTimeout(r, 6));
    }
  }
}