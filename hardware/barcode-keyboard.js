/**
 * src/hardware/barcode-keyboard.js
 * Pemindai barcode model keyboard wedge (USB / Bluetooth HID).
 * Scanner mengirim karakter sangat cepat (< threshold) diakhiri Enter.
 *
 * Aturan:
 *  - Listener global keydown (capture).
 *  - Abaikan bila fokus di input/textarea/contenteditable — agar
 *    search dan input manual tetap bisa diketik normal.
 *  - Buffer di-reset bila jeda antar key > thresholdMs.
 *  - Saat Enter dan buffer >= minLength → onScan(buffer).
 */

export class KeyboardWedgeScanner {
  /**
   * @param {{
   *   onScan: (code: string) => void,
   *   thresholdMs?: number,
   *   minLength?: number,
   * }} opts
   */
  constructor(opts) {
    this.onScan = opts.onScan;
    this.thresholdMs = opts.thresholdMs ?? 50;
    this.minLength = opts.minLength ?? 4;

    /** @type {string} */ this.buffer = '';
    /** @type {number} */ this.lastAt = 0;
    this._attached = false;
    this._keyHandler = (e) => this._onKey(e);
  }

  attach() {
    if (this._attached) return;
    window.addEventListener('keydown', this._keyHandler, true);
    this._attached = true;
  }

  detach() {
    if (!this._attached) return;
    window.removeEventListener('keydown', this._keyHandler, true);
    this._attached = false;
    this.buffer = '';
  }

  _isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  _onKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (this._isTypingTarget(e.target)) return;

    const now = Date.now();
    const gap = now - this.lastAt;
    this.lastAt = now;

    if (e.key === 'Enter') {
      const code = this.buffer.trim();
      this.buffer = '';
      if (code.length >= this.minLength) {
        e.preventDefault();
        try { this.onScan(code); } catch (err) { console.warn('[wedge]', err); }
      }
      return;
    }

    if (e.key.length !== 1) return;

    if (gap > this.thresholdMs) {
      this.buffer = e.key;               // jeda terlalu lama → mulai baru
    } else {
      this.buffer += e.key;
      if (this.buffer.length > 64) this.buffer = this.buffer.slice(-64);
    }
  }
}