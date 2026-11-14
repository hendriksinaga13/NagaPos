/**
 * src/ui/layouts/bottom-nav.js
 * Bottom nav 5 menu. Menu dinamis berdasarkan role user yang login.
 * 
 * - Owner/Admin: Kasir, Produk, Stok, Pelanggan, Lainnya
 * - Kasir: Kasir, Pelanggan, Lainnya (tanpa Produk & Stok)
 * - Salesman: disembunyikan sepenuhnya (ditangani app.js)
 */

import { el } from '../dom.js';
import { icon } from '../icon.js';
import { getCurrentRole } from '../../services/auth-service.js';
import { USER_ROLES } from '../../models/user.js';

const ALL_ITEMS = [
  { path: '/kasir',     label: 'Kasir',     icon: 'kasir',     match: ['/kasir', '/pembayaran'], roles: ['owner', 'admin', 'kasir'] },
  { path: '/produk',    label: 'Produk',    icon: 'produk',    match: ['/produk', '/satuan', '/diskon'], roles: ['owner', 'admin'] },
  { path: '/inventori', label: 'Stok',      icon: 'stok',      match: ['/inventori', '/pembelian'], roles: ['owner', 'admin'] },
  { path: '/pelanggan', label: 'Pelanggan', icon: 'pelanggan', match: ['/pelanggan', '/supplier'], roles: ['owner', 'admin', 'kasir'] },
  { path: '/lainnya',   label: 'Lainnya',   icon: 'lainnya',   match: ['/lainnya', '/riwayat', '/laporan', '/shift', '/printer', '/sinkron', '/pengaturan', '/audit-log', '/users'], roles: ['owner', 'admin', 'kasir'] },
];

export function createBottomNav() {
  let links = [];
  let root = null;

  function build() {
    const role = getCurrentRole();
    const items = ALL_ITEMS.filter((it) => !role || it.roles.includes(role));

    // Kalau tidak ada item (misal salesman), sembunyikan nav
    if (items.length === 0) {
      root = el('nav', { class: 'bottom-nav', style: { display: 'none' } });
      return;
    }

    // Atur ulang grid kolom sesuai jumlah item
    root = el('nav', {
      class: 'bottom-nav',
      'aria-label': 'Navigasi utama',
      style: { gridTemplateColumns: `repeat(${items.length}, 1fr)` },
    });

    links = items.map((it) => {
      const a = el('a', {
        class: 'bottom-nav__item',
        href: `#${it.path}`,
        dataset: { path: it.path },
      }, icon(it.icon), el('span', null, it.label));
      root.appendChild(a);
      return { ...it, el: a };
    });

    update();
  }

  function update() {
    const raw = location.hash.replace(/^#/, '') || '/kasir';
    const path = raw.split('?')[0];
    for (const l of links) {
      const active = l.match.some((m) => path === m || path.startsWith(m + '/'));
      if (active) l.el.setAttribute('aria-current', 'page');
      else l.el.removeAttribute('aria-current');
    }
  }

  build();
  window.addEventListener('hashchange', update);

  return {
    get root() { return root; },
    update,
    rebuild() {
      const oldRoot = root;
      build();
      if (oldRoot && oldRoot.parentNode) {
        oldRoot.parentNode.replaceChild(root, oldRoot);
      }
      return root;
    },
  };
}