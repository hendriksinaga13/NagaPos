/**
 * src/ui/components/toast.js
 * Notifikasi ringan non-blocking.
 */

import { el } from '../dom.js';
import { icon } from '../icon.js';

/** @type {HTMLElement|null} */
let root = null;

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('toast-root');
  if (!root) {
    root = el('div', { id: 'toast-root', class: 'toast-root', 'aria-live': 'polite' });
    document.body.appendChild(root);
  }
  return root;
}

/**
 * @param {string} message
 * @param {{ type?: 'info'|'success'|'danger'|'warning', duration?: number, icon?: string }} [opts]
 */
export function toast(message, opts = {}) {
  const { type = 'info', duration = 2500, icon: ic } = opts;
  const icons = { info: 'warning', success: 'check', danger: 'warning', warning: 'warning' };
  const node = el('div', { class: `toast toast--${type}`, role: 'status' },
    icon(ic || icons[type] || 'check', { size: 18 }),
    el('span', null, message),
  );
  ensureRoot().appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-open'));
  setTimeout(() => {
    node.classList.remove('is-open');
    setTimeout(() => node.remove(), 250);
  }, Math.max(1200, duration));
}

export const toastSuccess = (m, d) => toast(m, { type: 'success', duration: d });
export const toastError   = (m, d) => toast(m, { type: 'danger',  duration: d });
export const toastWarn    = (m, d) => toast(m, { type: 'warning', duration: d });