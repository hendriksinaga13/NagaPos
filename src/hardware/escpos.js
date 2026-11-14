/**
 * src/hardware/escpos.js
 * Pembangun perintah ESC/POS.
 *  - Menyusun potongan bytes dari teks dan perintah kontrol.
 *  - Semua teks di-encode ke Latin-1 (ASCII + fallback '?'), karena
 *    printer thermal umumnya tidak mendukung UTF-8.
 *  - Lebar karakter default font A: 32 (58mm) / 48 (80mm).
 */

const CMD = {
  INIT: [0x1B, 0x40],
  LF: [0x0A],
  ALIGN_LEFT: [0x1B, 0x61, 0x00],
  ALIGN_CENTER: [0x1B, 0x61, 0x01],
  ALIGN_RIGHT: [0x1B, 0x61, 0x02],
  BOLD_ON: [0x1B, 0x45, 0x01],
  BOLD_OFF: [0x1B, 0x45, 0x00],
  SIZE_NORMAL: [0x1D, 0x21, 0x00],
  SIZE_DOUBLE: [0x1D, 0x21, 0x11],
  SIZE_DOUBLE_HEIGHT: [0x1D, 0x21, 0x01],
  FEED: (n) => [0x1B, 0x64, n],
  CUT_PARTIAL: [0x1D, 0x56, 0x01],
  CUT_FULL: [0x1D, 0x56, 0x00],
  BEEP: [0x1B, 0x42, 0x03, 0x02],
  QR_MODEL: [0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00],
  QR_SIZE: [0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04],
  QR_EC: [0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31],
};

/**
 * Encode string ke Uint8Array (Latin-1). Karakter non-ASCII → '?'.
 * @param {string} s
 * @returns {Uint8Array}
 */
export function encodeLatin1(s) {
  const str = String(s ?? '');
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[i] = c < 256 ? c : 0x3F; // '?'
  }
  return out;
}

export class EscPosBuilder {
  constructor() {
    /** @type {Uint8Array[]} */
    this._parts = [];
    this._align = 'left';
    this._bold = false;
    this._size = 'normal';
  }

  _push(bytes) {
    this._parts.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return this;
  }

  init() { return this._push(CMD.INIT); }

  raw(bytes) { return this._push(bytes); }

  text(s) { return this._push(encodeLatin1(s)); }

  newline(n = 1) {
    for (let i = 0; i < n; i++) this._push(CMD.LF);
    return this;
  }

  line(s = '') { return this.text(s).newline(); }

  align(dir) {
    this._align = dir;
    if (dir === 'center') return this._push(CMD.ALIGN_CENTER);
    if (dir === 'right') return this._push(CMD.ALIGN_RIGHT);
    return this._push(CMD.ALIGN_LEFT);
  }

  bold(on) {
    this._bold = !!on;
    return this._push(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
  }

  doubleSize(on) {
    this._size = on ? 'double' : 'normal';
    return this._push(on ? CMD.SIZE_DOUBLE : CMD.SIZE_NORMAL);
  }

  feed(n = 1) { return this._push(CMD.FEED(n)); }

  cut() { return this._push(CMD.CUT_PARTIAL); }

  beep() { return this._push(CMD.BEEP); }

  /**
   * Garis horizontal dengan karakter.
   * @param {string} [ch]
   * @param {number} [width]
   */
  hr(ch = '-', width = 32) { return this.line(ch.repeat(width)); }

  /**
   * Baris dua kolom (kiri & kanan, rata lebar).
   * @param {string} left
   * @param {string} right
   * @param {number} [width] total karakter
   */
  columns(left, right, width = 32) {
    const L = String(left ?? '');
    const R = String(right ?? '');
    const pad = Math.max(1, width - L.length - R.length);
    return this.line(L + ' '.repeat(pad) + R);
  }

  /**
   * Baris tiga kolom: nama, qty×harga, total. Dipakai untuk item struk.
   * @param {string} name
   * @param {string} qtyPrice
   * @param {string} total
   * @param {number} [width]
   */
  itemRow(name, qtyPrice, total, width = 32) {
    const t = String(total);
    const left = String(name);
    const qs = String(qtyPrice);
    const w = width;

    // Baris 1: nama (full width).
    this.line(left);
    // Baris 2: qty × harga (kiri) + total (kanan).
    const pad = Math.max(1, w - qs.length - t.length);
    this.line(qs + ' '.repeat(pad) + t);
    return this;
  }

  /**
   * Cetak QR code (nomor nota / URL). Data maksimal ~100 byte.
   * @param {string} data
   */
  qr(data) {
    const bytes = encodeLatin1(data);
    const len = bytes.length + 3;
    // QR model & size & EC
    this._push(CMD.QR_MODEL);
    this._push(CMD.QR_SIZE);
    this._push(CMD.QR_EC);
    // Store data: GS ( k pL pH cn fn m d1..dk
    this._push([
      0x1D, 0x28, 0x6B,
      len & 0xFF, (len >> 8) & 0xFF,
      0x31, 0x50, 0x30,
      ...bytes,
    ]);
    // Print symbol: GS ( k 03 00 31 51 30
    this._push([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);
    return this.newline();
  }

  /**
   * Cetak logo raster (GS v 0 m xL xH yL yH d...).
   * @param {Uint8Array} bits  bitmap 1-bit, MSB per byte
   * @param {number} widthBytes  lebar dalam byte (lebar piksel / 8)
   * @param {number} heightPx    tinggi dalam piksel
   */
  raster(bits, widthBytes, heightPx) {
    this._push([
      0x1D, 0x76, 0x30, 0x00,
      widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
      heightPx & 0xFF, (heightPx >> 8) & 0xFF,
    ]);
    this._push(bits);
    return this;
  }

  /** @returns {Uint8Array} */
  build() {
    let total = 0;
    for (const p of this._parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of this._parts) { out.set(p, off); off += p.length; }
    return out;
  }
}

/**
 * Konversi data URL gambar (PNG/JPEG) ke bitmap 1-bit untuk raster ESC/POS.
 * @param {string} dataUrl
 * @param {{ maxWidthPx?: number, threshold?: number }} [opts]
 * @returns {Promise<{ bits: Uint8Array, widthBytes: number, heightPx: number } | null>}
 */
export async function dataUrlToRaster(dataUrl, opts = {}) {
  if (!dataUrl) return null;
  const { maxWidthPx = 384, threshold = 128 } = opts;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxWidthPx / img.width);
        const w = Math.max(8, Math.round(img.width * ratio));
        const h = Math.round(img.height * ratio);

        // Lebar harus kelipatan 8.
        const widthBytes = Math.ceil(w / 8);
        const widthPx = widthBytes * 8;

        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, widthPx, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, widthPx, h).data;

        const bits = new Uint8Array(widthBytes * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < widthPx; x++) {
            const i = (y * widthPx + x) * 4;
            const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
            // Transparan → putih.
            const lum = a < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * b);
            if (lum < threshold) {
              // Bit 1 = hitam.
              const byteIdx = y * widthBytes + (x >> 3);
              bits[byteIdx] |= 0x80 >> (x & 7);
            }
          }
        }
        resolve({ bits, widthBytes, heightPx: h });
      } catch (e) {
        console.warn('[escpos] rasterize gagal', e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}