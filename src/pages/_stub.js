/**
 * src/pages/_stub.js
 * Helper untuk halaman placeholder tahap selanjutnya.
 * Setiap halaman baru cukup:
 *   export default makeStubPage({ title: 'Produk', icon: 'produk', stage: 7, desc: '...' });
 */

import { el } from '../ui/dom.js';
import { icon } from '../ui/icon.js';

/**
 * @param {{ title: string, icon?: string, stage: number, desc?: string }} opts
 */
export function makeStubPage(opts) {
  const { title, icon: ic = 'lainnya', stage, desc = '' } = opts;
  return {
    title,
    layout: 'main',
    async mount(root, params, ctx) {
      if (ctx && typeof ctx.setNavbarTitle === 'function') ctx.setNavbarTitle(title);
      root.appendChild(
        el('div', { class: 'page__header' }, el('h2', { class: 'page__title' }, title)),
      );
      root.appendChild(
        el('div', { class: 'empty' },
          icon(ic, { size: 48 }),
          el('div', { class: 'empty__title' }, `${title} — belum diisi`),
          el('div', null, desc || `Halaman ini akan diimplementasikan pada Tahap ${stage}.`),
        ),
      );
    },
  };
}