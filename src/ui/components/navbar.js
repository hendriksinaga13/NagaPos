/**
 * src/ui/components/navbar.js
 * Navbar sticky: tombol kembali, judul, slot aksi, indikator status.
 * Indikator online/sync/printer adalah state yang akan diperbarui oleh
 * sync-manager dan printer-service di tahap berikutnya.
 */

import { el } from '../dom.js';
import { icon } from '../icon.js';

/** @typedef {{ title:string, showBack?:boolean, actions?:HTMLElement[], onBack?:() => void }} NavbarOpts */

export function createNavbar(opts) {
  const { title, showBack = false, actions = [], onBack } = opts;

  const backBtn = el('button', {
    class: 'navbar__back',
    type: 'button',
    'aria-label': 'Kembali',
    hidden: !showBack,
    onClick: () => (onBack ? onBack() : history.back()),
  }, icon('back'));

  const titleEl = el('h1', { class: 'navbar__title' }, title);

  const online = el('span', { class: 'status-dot', dataset: { state: 'on' }, title: 'Online' },
    icon('wifi', { size: 16 }));
  const sync = el('span', { class: 'status-dot', dataset: { state: 'off' }, title: 'Tersinkron' },
    icon('sync', { size: 16 }));
  const printer = el('span', { class: 'status-dot', dataset: { state: 'off' }, title: 'Printer' },
    icon('printer', { size: 16 }));

  const status = el('div', { class: 'navbar__status' }, online, sync, printer);

  const actionsWrap = el('div', { class: 'navbar__status' }, ...actions);

  const root = el('header', { class: 'navbar' }, backBtn, titleEl, actionsWrap, status);

  return {
    root,
    setTitle(t) { titleEl.textContent = t; },
    setBackVisible(v) { backBtn.hidden = !v; },
    setOnline(isOnline) { online.dataset.state = isOnline ? 'on' : 'off'; online.title = isOnline ? 'Online' : 'Offline'; },
    setSyncState(state) { // 'idle'|'syncing'|'error'|'off'
      sync.dataset.state = state === 'idle' ? 'on' : state === 'syncing' ? 'warn' : state === 'error' ? 'off' : 'off';
      sync.title = `Sync: ${state}`;
    },
    setPrinterState(connected) { printer.dataset.state = connected ? 'on' : 'off'; printer.title = connected ? 'Printer terhubung' : 'Printer tidak terhubung'; },
  };
}