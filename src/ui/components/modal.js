/**
 * src/ui/components/modal.js
 * Bottom sheet / modal. Satu modal aktif pada satu waktu.
 * API:
 *   const m = openModal({ title, content, actions, dismissible });
 *   m.close();
 *   const ok = await confirm({ title, message });
 */

import { el } from '../dom.js';
import { icon } from '../icon.js';

/** @type {HTMLElement|null} */
let currentBackdrop = null;
/** @type {HTMLElement|null} */
let currentModal = null;
/** @type {(() => void)|null} */
let currentOnClose = null;

function cleanup() {
  if (currentBackdrop) currentBackdrop.remove();
  if (currentModal) currentModal.remove();
  currentBackdrop = null;
  currentModal = null;
  const cb = currentOnClose;
  currentOnClose = null;
  if (cb) cb();
}

/**
 * @param {{
 *   title: string,
 *   content: HTMLElement|string,
 *   actions?: HTMLElement[],
 *   dismissible?: boolean,
 *   onClose?: () => void,
 *   fullHeight?: boolean,
 * }} opts
 */
export function openModal(opts) {
  closeModal();
  const { title, content, actions = [], dismissible = true, onClose, fullHeight = false } = opts;

  const backdrop = el('div', { class: 'modal-backdrop' });
  const closeBtn = el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'Tutup',
    onClick: dismissible ? closeModal : undefined,
  }, icon('close'));

  const bodyContent = typeof content === 'string'
    ? el('div', { html: content })
    : content;

  const modal = el('div', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
    style: fullHeight ? { maxHeight: '95dvh' } : undefined,
  },
    el('div', { class: 'modal__handle' }),
    el('div', { class: 'modal__header' }, el('div', { class: 'modal__title' }, title), closeBtn),
    el('div', { class: 'modal__body' }, bodyContent),
    actions.length ? el('div', { class: 'modal__footer' }, ...actions) : null,
  );

  if (dismissible) {
    backdrop.addEventListener('click', closeModal);
  }

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  currentBackdrop = backdrop;
  currentModal = modal;
  currentOnClose = onClose || null;

  document.addEventListener('keydown', escListener);

  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    modal.classList.add('is-open');
  });

  return { modal, close: closeModal };
}

function escListener(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  document.removeEventListener('keydown', escListener);
  if (currentBackdrop) currentBackdrop.classList.remove('is-open');
  if (currentModal) currentModal.classList.remove('is-open');
  const bd = currentBackdrop;
  const md = currentModal;
  const cb = currentOnClose;
  currentBackdrop = null;
  currentModal = null;
  currentOnClose = null;
  setTimeout(() => {
    bd?.remove();
    md?.remove();
    if (cb) cb();
  }, 200);
}

/**
 * Konfirmasi. Resolve true jika OK, false jika batal.
 * @param {{ title: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirm(opts) {
  const { title, message, confirmText = 'OK', cancelText = 'Batal', danger = false } = opts;
  return new Promise((resolve) => {
    let settled = false;
    const cancel = el('button', {
      class: 'btn btn--ghost', type: 'button',
      onClick: () => { if (!settled) { settled = true; resolve(false); closeModal(); } },
    }, cancelText);
    const ok = el('button', {
      class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button',
      onClick: () => { if (!settled) { settled = true; resolve(true); closeModal(); } },
    }, confirmText);

    openModal({
      title,
      content: el('p', { style: { margin: '0' } }, message),
      actions: [cancel, ok],
      onClose: () => { if (!settled) { settled = true; resolve(false); } },
    });
  });
}