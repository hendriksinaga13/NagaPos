/**
 * src/ui/components/numpad.js
 * Numpad besar untuk input qty & nominal.
 * Callback onInput(valueString) setiap kali berubah; onEnter() pada tombol OK.
 *
 * Perbaikan: Tombol hapus (backspace) dan tombol lainnya sekarang mengirim
 * elemen DOM (Node) secara langsung, bukan string HTML.
 */

import { el } from '../dom.js';
import { icon } from '../icon.js';

/**
 * @param {{
 *   onInput?: (value: string) => void,
 *   onEnter?: (value: string) => void,
 *   allowDecimal?: boolean,
 *   allowNegative?: boolean,
 *   maxLen?: number,
 *   initial?: string,
 *   enterLabel?: string,
 * }} [opts]
 */
export function createNumpad(opts = {}) {
  const {
    onInput, onEnter,
    allowDecimal = false,
    allowNegative = false,
    maxLen = 15,
    initial = '',
    enterLabel = 'OK',
  } = opts;

  /** @type {string} */
  let value = initial;

  // --- Display (layar numpad) ---
  const display = el('div', {
    class: 'numpad__display',
    style: {
      fontSize: 'var(--fs-2xl)', fontWeight: '700',
      textAlign: 'right', padding: '8px 12px',
      marginBottom: '12px', background: 'var(--color-surface-2)',
      borderRadius: 'var(--radius-md)', minHeight: '56px',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      fontVariantNumeric: 'tabular-nums', overflow: 'hidden',
    },
  }, value || '0');

  const update = () => {
    display.textContent = value || '0';
    if (onInput) onInput(value);
  };

  const push = (ch) => {
    if (value.length >= maxLen) return;
    if (ch === '.' && !allowDecimal) return;
    if (ch === '.' && value.includes('.')) return;
    if (ch === '.' && !value) value = '0.';
    else value += ch;
    update();
  };

  const backspace = () => { 
    value = value.slice(0, -1); 
    update(); 
  };
  
  const clearAll = () => { 
    value = ''; 
    update(); 
  };
  
  const toggleSign = () => {
    if (!allowNegative) return;
    if (value.startsWith('-')) value = value.slice(1);
    else value = '-' + value;
    update();
  };

  // Fungsi helper membuat tombol. Label BISA berupa string atau Node (SVG)
  const key = (label, onClick, extra = '') =>
    el('button', {
      class: `numpad__key ${extra}`.trim(),
      type: 'button',
      onClick,
    }, label);

  // --- Baris Tombol ---
  const keys = [
    key('1', () => push('1')),
    key('2', () => push('2')),
    key('3', () => push('3')),
    key('4', () => push('4')),
    key('5', () => push('5')),
    key('6', () => push('6')),
    key('7', () => push('7')),
    key('8', () => push('8')),
    key('9', () => push('9')),
    
    allowDecimal ? key('.', () => push('.')) : key('C', clearAll, 'numpad__key--danger'),
    
    key('0', () => push('0')),
    
    // PERBAIKAN: Panggil icon() yang mengembalikan Node SVG, jangan pakai .outerHTML
    key(icon('back', { size: 20 }), backspace, 'numpad__key--danger'),
    
    allowNegative
      ? key('±', toggleSign, 'numpad__key--danger')
      : key('C', clearAll, 'numpad__key--danger'),
      
    key(enterLabel, () => onEnter ? onEnter(value) : null, 'numpad__key--wide numpad__key--primary'),
  ];

  const root = el('div', { class: 'numpad' }, display, ...keys);

  return {
    root,
    getValue: () => value,
    setValue: (v) => { value = String(v ?? ''); update(); },
    clear: clearAll,
  };
}