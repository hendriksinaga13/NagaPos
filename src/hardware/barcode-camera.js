/**
 * src/hardware/barcode-camera.js
 * Pemindai barcode via kamera memakai BarcodeDetector API (Chrome Android).
 *  - getUserMedia (facingMode: environment)
 *  - Deteksi tiap ~120ms
 *  - Debounce per kode agar tidak dobel
 *  - Stop & bebaskan kamera saat selesai
 *
 * Keterbatasan: BarcodeDetector belum ada di Firefox/Safari.
 * start() akan melempar Error; UI menampilkan pesan + fallback input manual.
 */

const DEFAULT_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93', 'itf', 'codabar',
  'qr_code', 'data_matrix',
];

export class BarcodeCameraScanner {
  /**
   * @param {{
   *   onDetect: (text: string, format: string) => void,
   *   onError?: (e: Error) => void,
   *   debounceMs?: number,
   *   formats?: string[],
   * }} opts
   */
  constructor(opts) {
    this.onDetect = opts.onDetect;
    this.onError = opts.onError || (() => {});
    this.debounceMs = opts.debounceMs ?? 1500;
    this.formats = opts.formats || DEFAULT_FORMATS;

    /** @type {MediaStream|null} */ this.stream = null;
    /** @type {HTMLVideoElement|null} */ this.video = null;
    /** @type {any} */ this.detector = null;
    /** @type {number|null} */ this.timer = null;
    /** @type {string} */ this.lastCode = '';
    /** @type {number} */ this.lastAt = 0;
    this.running = false;
    this.supported = 'BarcodeDetector' in window;
  }

  /** @param {HTMLVideoElement} video @returns {Promise<void>} */
  async start(video) {
    if (this.running) return;
    if (!this.supported) {
      throw new Error('Browser ini tidak mendukung BarcodeDetector. Gunakan Chrome Android atau input manual.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Kamera tidak tersedia di perangkat ini.');
    }
    this.video = video;

    try {
      // @ts-ignore — BarcodeDetector belum ada di lib.dom resmi
      this.detector = new window.BarcodeDetector({ formats: this.formats });
    } catch (e) {
      throw new Error('Gagal menyiapkan BarcodeDetector: ' + (e.message || e));
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Berikan izin kamera di pengaturan browser.'
        : e.name === 'NotFoundError'
          ? 'Tidak ada kamera terdeteksi di perangkat.'
          : 'Gagal membuka kamera: ' + (e.message || e);
      throw new Error(msg);
    }

    video.srcObject = this.stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    try { await video.play(); } catch { /* autoplay diblok, lanjut */ }

    this.running = true;
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    const tick = async () => {
      if (!this.running || !this.video || !this.detector) return;
      try {
        // @ts-ignore
        const codes = await this.detector.detect(this.video);
        if (codes && codes.length > 0) {
          const c = codes[0];
          const text = c.rawValue || '';
          const now = Date.now();
          if (text && (text !== this.lastCode || now - this.lastAt > this.debounceMs)) {
            this.lastCode = text;
            this.lastAt = now;
            try { this.onDetect(text, c.format || ''); }
            catch (err) { console.warn('[scan] onDetect error', err); }
          }
        }
      } catch { /* frame transisi kadang error; abaikan */ }
      if (this.running) this.timer = window.setTimeout(tick, 120);
    };
    this.timer = window.setTimeout(tick, 120);
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.video && this.video.srcObject) {
      try { this.video.srcObject = null; } catch { /* noop */ }
    }
    this.video = null;
    this.detector = null;
  }
}