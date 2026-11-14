/**
 * src/ui/components/search-box.js
 * Input pencarian dengan ikon dan tombol clear.
 */

import { el } from '../dom.js';
import { icon } from '../icon.js';

/**
 * @param {{ placeholder?: string, onInput: (value:string) => void, autoFocus?: boolean }} opts
 */
export function createSearchBox(opts) {
  const { placeholder = 'Cari…', onInput, autoFocus = false } = opts;

  const input = el('input', {
    type: 'search',
    class: 'input',
    placeholder,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    onInput: (e) => onInput(e.target.value),
  });

  const clearBtn = el('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': 'Hapus',
    style: { position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', minWidth: '40px', minHeight: '40px', display: 'none' },
    onClick: () => { input.value = ''; onInput(''); input.focus(); clearBtn.style.display = 'none'; },
  }, icon('close', { size: 18 }));

  input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'grid' : 'none';
  });

  const root = el('div', { class: 'search-box' },
    el('span', { class: 'search-box__icon' }, icon('search', { size: 20 })),
    input,
    clearBtn,
  );

  if (autoFocus) setTimeout(() => input.focus(), 50);

  return {
    root,
    get value() { return input.value; },
    set value(v) { input.value = v; },
    focus() { input.focus(); },
  };
}