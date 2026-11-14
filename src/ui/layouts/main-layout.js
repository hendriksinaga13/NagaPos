/**
 * src/ui/layouts/main-layout.js
 * Layout aplikasi: navbar + outlet (tempat router render halaman) + bottom-nav.
 */

import { el } from '../dom.js';
import { createNavbar } from '../components/navbar.js';
import { createBottomNav } from './bottom-nav.js';

export function createMainLayout() {
  const navbar = createNavbar({ title: 'Kasir', showBack: false });
  const outlet = el('main', { class: 'app-outlet', id: 'outlet' });
  const bottomNav = createBottomNav();

  const root = el('div', { class: 'app-shell' }, navbar.root, outlet, bottomNav.root);

  // Sinkronkan judul navbar ke document.title.
  function setTitle(t) { navbar.setTitle(t); document.title = t + ' • Kasir'; }

  return { root, outlet, navbar, bottomNav, setTitle };
}