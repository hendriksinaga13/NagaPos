/**
 * src/core/shortcuts.js
 * Manajer shortcut keyboard global.
 *  - Tidak aktif saat user sedang mengetik (kecuali Esc).
 *  - Kombinasi didaftarkan dengan string seperti 'alt+1', 'f2', 'ctrl+shift+p'.
 *  - Tekan '?' atau 'F1' untuk melihat overlay bantuan.
 */

export class ShortcutManager {
  constructor() {
    this._map = new Map();
    this._attached = false;
    this._helpOverlay = null;
    this._enabled = true;
    this._onKey = (e) => this._handle(e);
  }

  attach() {
    if (this._attached) return;
    window.addEventListener('keydown', this._onKey, true);
    this._attached = true;
  }

  detach() {
    if (!this._attached) return;
    window.removeEventListener('keydown', this._onKey, true);
    this._attached = false;
  }

  setEnabled(v) { this._enabled = !!v; }

  /**
   * @param {{ key:string, label:string, group?:string, handler:(e:KeyboardEvent)=>void, scope?:string }} descriptor
   * @returns {() => void} disposer
   */
  register(descriptor) {
    const key = descriptor.key.toLowerCase();
    this._map.set(key, descriptor);
    return () => this._map.delete(key);
  }

  registerMany(list) {
    return list.map((d) => this.register(d));
  }

  _isTyping(target) {
    if (!target || !(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  _comboOf(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('meta');
    let k = e.key;
    if (k === ' ') k = 'space';
    if (k === '?') return '?';
    parts.push(k.toLowerCase());
    return parts.join('+');
  }

  _handle(e) {
    if (!this._enabled) return;

    const combo = this._comboOf(e);

    // Bantuan: F1 atau '?'
    if (combo === 'f1' || combo === '?') {
      e.preventDefault();
      this._showHelp();
      return;
    }
    // Esc menutup bantuan atau modal (didaftarkan sebagai shortcut 'esc').
    if (combo === 'esc' && this._helpOverlay) {
      e.preventDefault();
      this._hideHelp();
      return;
    }

    const descriptor = this._map.get(combo);
    if (!descriptor) return;

    // Jangan ganggu saat user mengetik — kecuali Esc.
    if (this._isTyping(e.target) && combo !== 'esc') return;

    try {
      e.preventDefault();
      descriptor.handler(e);
    } catch (err) {
      console.warn('[shortcut] gagal', combo, err);
    }
  }

  /* ============ Overlay Bantuan ============ */

  _showHelp() {
    if (this._helpOverlay) return;

    const groups = new Map();
    for (const d of this._map.values()) {
      const g = d.group || 'Umum';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(d);
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:rgba(15,23,42,.7);
      display:flex; align-items:center; justify-content:center;
      padding:24px;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background:var(--color-surface,#fff);
      color:var(--color-text,#0f172a);
      border-radius:16px;
      max-width:520px; width:100%; max-height:80vh; overflow-y:auto;
      padding:20px;
      font-family:var(--font-sans,system-ui);
    `;
    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="font-size:18px; font-weight:700;">Pintasan Keyboard</h2>
        <button type="button" data-close style="font-size:22px; background:none; border:0; cursor:pointer; color:inherit;">×</button>
      </div>
    `;

    for (const [g, list] of groups) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '16px';
      sec.innerHTML = `<div style="font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--color-text-muted,#64748b); margin-bottom:6px;">${g}</div>`;
      for (const d of list) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--color-border,#e2e8f0);';
        row.innerHTML = `
          <span style="font-size:13px;">${d.label}</span>
          <kbd style="font-family:ui-monospace,monospace; font-size:11px; background:var(--color-surface-2,#f1f5f9); padding:2px 6px; border-radius:4px; border:1px solid var(--color-border,#e2e8f0);">${d.key.toUpperCase().replace(/\+/g, ' + ')}</kbd>
        `;
        sec.appendChild(row);
      }
      panel.appendChild(sec);
    }

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (e.target === overlay || t.hasAttribute?.('data-close')) this._hideHelp();
    });

    document.body.appendChild(overlay);
    this._helpOverlay = overlay;
  }

  _hideHelp() {
    if (this._helpOverlay) {
      this._helpOverlay.remove();
      this._helpOverlay = null;
    }
  }
}

let _instance = null;
export function getShortcutManager() {
  if (!_instance) _instance = new ShortcutManager();
  return _instance;
}