/**
 * src/ui/components/locked-overlay.js
 * Overlay card yang muncul saat fitur butuh upgrade.
 * Dipakai di halaman yang di-gate (IMEI, Batch, Multi-User, dll).
 */

import { el, clear } from '../dom.js';
import { icon } from '../icon.js';
import { FEATURE_LABEL } from '../../models/license.js';
import { navigate } from '../../router.js';

/**
 * Render locked page di root. Mengosongkan root dulu.
 * 
 * @param {HTMLElement} root
 * @param {object} ctx
 * @param {string} featureName
 * @param {{ editionNeeded?: string }} [opts]
 */
export function renderLockedPage(root, ctx, featureName, opts = {}) {
  const { editionNeeded = 'PRO' } = opts;
  const label = FEATURE_LABEL[featureName] || featureName;
  const state = ctx.license || {};

  clear(root);

  const container = el('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '24px 16px',
      textAlign: 'center',
    },
  },
    el('div', {
      style: {
        width: '80px', height: '80px',
        borderRadius: '50%',
        background: 'var(--color-warning-soft)',
        color: 'var(--color-warning)',
        display: 'grid', placeItems: 'center',
        marginBottom: '16px',
      },
    }, icon('warning', { size: 44 })),

    el('h2', {
      style: { fontSize: 'var(--fs-xl)', marginBottom: '8px' },
    }, 'Fitur Terkunci'),

    el('p', {
      style: {
        fontSize: 'var(--fs-sm)',
        color: 'var(--color-text-muted)',
        marginBottom: '24px',
        maxWidth: '320px',
      },
    }, `"${label}" hanya tersedia di edisi ${editionNeeded} atau lebih tinggi.`),

    state.edition
      ? el('div', {
          class: 'card',
          style: {
            padding: '12px 16px',
            marginBottom: '16px',
            width: '100%',
            maxWidth: '320px',
          },
        },
          el('div', { class: 'card__row' },
            el('span', null, 'Lisensi Anda'),
            el('strong', null, state.edition),
          ),
          state.isTrial
            ? el('div', { class: 'card__row' },
                el('span', null, 'Trial'),
                el('strong', { style: { color: state.isExpired ? 'var(--color-danger)' : 'var(--color-warning)' } },
                  state.isExpired ? 'Berakhir' : `${state.daysLeft} hari lagi`,
                ),
              )
            : null,
        )
      : null,

    el('button', {
      class: 'btn btn--primary btn--lg btn--block',
      type: 'button',
      style: { maxWidth: '320px' },
      onClick: () => navigate('/lisensi'),
    }, 'Buka Halaman Lisensi'),

    el('button', {
      class: 'btn btn--ghost btn--block',
      type: 'button',
      style: { maxWidth: '320px', marginTop: '8px' },
      onClick: () => navigate('/kasir'),
    }, 'Kembali ke Kasir'),
  );

  root.appendChild(container);
}

/**
 * Cek fitur, kalau tidak ada render locked page.
 * @returns {boolean} true = available (lanjut render), false = locked (sudah render overlay)
 */
export function checkFeature(root, ctx, featureName, opts = {}) {
  const state = ctx.license;
  if (!state) return true;

  // Kalau locked (trial expired & no license), semua terkunci
  if (state.isLocked) {
    renderLockedPage(root, ctx, featureName, opts);
    return false;
  }

  // Cek fitur
  const has = state.features.includes('*') || state.features.includes(featureName);
  if (!has) {
    renderLockedPage(root, ctx, featureName, opts);
    return false;
  }
  return true;
}