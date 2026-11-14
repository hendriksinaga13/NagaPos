/**
 * src/pages/lisensi.js
 * Halaman lisensi & aktivasi.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatDate } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toast, toastSuccess, toastError } from '../ui/components/toast.js';
import { getLicenseState, activateLicense, deactivateLicense } from '../services/license-service.js';
import {
  EDITION, EDITION_LABEL, EDITION_COLOR, EDITION_PRICE, EDITION_DESCRIPTION,
  FEATURE, FEATURE_LABEL, TRIAL_DAYS,
} from '../models/license.js';
import { getCurrentUser } from '../services/auth-service.js';
import { USER_ROLES } from '../models/user.js';
import { navigate } from '../router.js';

const FEATURE_GROUPS = [
  {
    title: 'Kasir & Transaksi',
    features: [
      FEATURE.KASIR, FEATURE.PRINTER, FEATURE.WHATSAPP_RECEIPT,
      FEATURE.CUSTOMER_DISPLAY, FEATURE.KEYBOARD_SHORTCUTS, FEATURE.BACKUP,
    ],
  },
  {
    title: 'Master Data',
    features: [FEATURE.PRODUK, FEATURE.PELANGGAN, FEATURE.SHIFT, FEATURE.BARCODE_GEN],
  },
  {
    title: 'Laporan',
    features: [FEATURE.LAPORAN],
  },
  {
    title: 'Fitur Pro',
    features: [FEATURE.MULTI_USER, FEATURE.AUDIT_LOG, FEATURE.SERIAL_IMEI, FEATURE.BATCH_EXPIRY, FEATURE.SALES_ORDER],
  },
  {
    title: 'Fitur Enterprise',
    features: [FEATURE.SELF_ORDER, FEATURE.LOYALTY, FEATURE.VOUCHER, FEATURE.DASHBOARD, FEATURE.MULTI_OUTLET],
  },
];

const page = {
  title: 'Lisensi',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Lisensi');
    ctx.setNavbarBack?.(true);

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    const state = ctx.license || await getLicenseState(ctx);
    const user = getCurrentUser();

    /* ============ HEADER ============ */

    pageEl.appendChild(el('div', { class: 'page__header' },
      el('h2', { class: 'page__title' }, 'Lisensi'),
    ));

    /* ============ STATUS CARD ============ */

    const editionColor = EDITION_COLOR[state.edition] || 'info';
    const statusTitle = state.isLocked ? 'Aktivasi Diperlukan'
      : state.isTrial ? `Trial — ${state.daysLeft > 0 ? state.daysLeft + ' hari lagi' : 'Berakhir'}`
      : `Aktif s/d ${formatDate(state.expiry)}`;

    pageEl.appendChild(el('div', {
      class: 'card',
      style: {
        borderColor: state.isLocked ? 'var(--color-danger)' : `var(--color-${editionColor})`,
        background: state.isLocked ? 'var(--color-danger-soft)' : 'var(--color-surface)',
        marginBottom: '16px',
      },
    },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
        el('div', {
          style: {
            width: '56px', height: '56px', borderRadius: '50%',
            background: `var(--color-${editionColor})`,
            color: '#fff',
            display: 'grid', placeItems: 'center',
          },
        }, icon(state.isLocked ? 'warning' : 'check', { size: 28 })),
        el('div', { style: { flex: 1 } },
          el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } }, 'Status'),
          el('div', { style: { fontSize: 'var(--fs-lg)', fontWeight: '700' } }, statusTitle),
        ),
      ),
      el('div', { class: 'card__row' },
        el('span', null, 'Edisi'),
        el('strong', { class: `chip chip--${editionColor}` }, EDITION_LABEL[state.edition] || state.edition),
      ),
      state.isExpired
        ? el('div', { class: 'card__row' },
            el('span', null, 'Masa Tenggang'),
            el('strong', { style: { color: 'var(--color-warning)' } },
              state.isLocked ? 'Habis' : 'Aktif'),
          )
        : null,
      state.isTrial && !state.isExpired
        ? el('div', { class: 'card__row' },
            el('span', null, 'Berakhir'),
            el('strong', null, formatDate(state.expiry)),
          )
        : null,
      !state.isTrial
        ? el('div', { class: 'card__row' },
            el('span', null, 'Berlaku s/d'),
            el('strong', null, formatDate(state.expiry)),
          )
        : null,
    ));

    /* ============ TRIAL INFO ============ */

    if (state.isTrial && !state.isExpired) {
      pageEl.appendChild(el('div', {
        class: 'card',
        style: {
          background: 'var(--color-primary-soft)',
          borderColor: 'var(--color-primary)',
          marginBottom: '16px',
          padding: '12px',
        },
      },
        el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
          el('div', { style: { color: 'var(--color-primary)', flexShrink: 0 } }, icon('warning', { size: 20 })),
          el('div', null,
            el('div', { style: { fontWeight: '700', marginBottom: '4px' } }, `Trial ${TRIAL_DAYS} hari`),
            el('div', { style: { fontSize: 'var(--fs-xs)', lineHeight: '1.5' } },
              'Semua fitur terbuka selama trial. Setelah itu perlu aktivasi lisensi untuk tetap menggunakan aplikasi.'),
          ),
        ),
      ));
    }

    /* ============ AKTIVASI FORM ============ */

    const activateCard = el('div', { class: 'card', style: { marginBottom: '16px' } });
    pageEl.appendChild(activateCard);
    renderActivateForm();

    function renderActivateForm() {
      clear(activateCard);
      activateCard.appendChild(el('div', { class: 'card__title' }, 'Aktivasi Kode Lisensi'));

      const input = el('input', {
        class: 'input',
        type: 'text',
        placeholder: 'Contoh: PRO-20271231-a1b2c3d4',
        style: { fontFamily: 'ui-monospace,monospace', textTransform: 'uppercase' },
        value: state.key || '',
      });

      const hint = el('div', {
        style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', marginTop: '4px' },
      }, 'Kode diberikan oleh penjual setelah pembelian.');

      const btn = el('button', {
        class: 'btn btn--primary btn--lg btn--block',
        type: 'button',
        style: { marginTop: '12px' },
        onClick: async () => {
          const key = String(input.value || '').trim();
          if (!key) { toastError('Masukkan kode lisensi'); return; }

          btn.disabled = true;
          btn.textContent = 'Mengaktivasi…';

          try {
            const result = await activateLicense(ctx, key);
            if (!result.success) {
              toastError(result.error || 'Gagal aktivasi');
              btn.disabled = false;
              btn.textContent = 'Aktivasi';
              return;
            }
            toastSuccess(`Lisensi ${EDITION_LABEL[result.state.edition]} aktif!`);
            if (ctx.refreshSettings) await ctx.refreshSettings();
            ctx.license = await getLicenseState(ctx);
            setTimeout(() => location.reload(), 1000);
          } catch (e) {
            toastError(e.message || 'Gagal aktivasi');
            btn.disabled = false;
            btn.textContent = 'Aktivasi';
          }
        },
      }, 'Aktivasi');

      activateCard.appendChild(input);
      activateCard.appendChild(hint);
      activateCard.appendChild(btn);

      // Deactivate (owner only, untuk testing)
      if (user && user.role === USER_ROLES.OWNER && state.key) {
        activateCard.appendChild(el('button', {
          class: 'btn btn--danger btn--block',
          type: 'button',
          style: { marginTop: '8px', fontSize: 'var(--fs-xs)' },
          onClick: async () => {
            const ok = await confirm({
              title: 'Hapus Lisensi',
              message: 'Yakin ingin menghapus lisensi? Aplikasi akan kembali ke mode trial (atau terkunci jika trial habis).',
              confirmText: 'Hapus', danger: true,
            });
            if (!ok) return;
            try {
              await deactivateLicense(ctx);
              toastSuccess('Lisensi dihapus');
              setTimeout(() => location.reload(), 1000);
            } catch (e) { toastError(e.message); }
          },
        }, 'Hapus Lisensi (Reset)'));
      }
    }

    /* ============ PRICING ============ */

    pageEl.appendChild(el('div', {
      style: { fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '24px', marginBottom: '8px' },
    }, 'Pilihan Edisi'));

    const editions = [EDITION.BASIC, EDITION.PRO, EDITION.ENT];
    for (const ed of editions) {
      const isCurrent = state.edition === ed;
      const color = EDITION_COLOR[ed];
      pageEl.appendChild(el('div', {
        class: 'card',
        style: {
          borderColor: isCurrent ? `var(--color-${color})` : undefined,
          borderWidth: isCurrent ? '2px' : undefined,
          marginBottom: '12px',
          position: 'relative',
        },
      },
        isCurrent
          ? el('span', {
              style: {
                position: 'absolute', top: '8px', right: '8px',
                fontSize: '10px', fontWeight: '700', padding: '2px 8px',
                background: `var(--color-${color})`, color: '#fff',
                borderRadius: 'var(--radius-full)',
              },
            }, 'EDISI ANDA')
          : null,
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' } },
          el('div', null,
            el('div', { style: { fontSize: 'var(--fs-lg)', fontWeight: '700' } }, EDITION_LABEL[ed]),
            el('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--color-primary)', fontWeight: '700', marginTop: '2px' } }, EDITION_PRICE[ed]),
          ),
        ),
        el('p', { style: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)', lineHeight: '1.5' } }, EDITION_DESCRIPTION[ed]),
      ));
    }

    /* ============ FEATURE TABLE ============ */

    pageEl.appendChild(el('div', {
      style: { fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '24px', marginBottom: '8px' },
    }, 'Perbandingan Fitur'));

    for (const group of FEATURE_GROUPS) {
      const groupCard = el('div', { class: 'card', style: { marginBottom: '8px', padding: '12px' } });
      groupCard.appendChild(el('div', { style: { fontSize: 'var(--fs-sm)', fontWeight: '700', marginBottom: '8px' } }, group.title));

      for (const feat of group.features) {
        const has = state.features.includes('*') || state.features.includes(feat);
        groupCard.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 0',
            fontSize: 'var(--fs-sm)',
            color: has ? 'var(--color-text)' : 'var(--color-text-muted)',
          },
        },
          el('div', {
            style: {
              width: '20px', height: '20px', borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              background: has ? 'var(--color-success)' : 'var(--color-surface-2)',
              color: has ? '#fff' : 'var(--color-text-muted)',
              flexShrink: 0,
            },
          }, icon(has ? 'check' : 'close', { size: 14 })),
          el('span', null, FEATURE_LABEL[feat] || feat),
        ));
      }
      pageEl.appendChild(groupCard);
    }

    /* ============ CONTACT ============ */

    pageEl.appendChild(el('div', {
      class: 'card',
      style: { marginTop: '16px', textAlign: 'center', padding: '16px' },
    },
      el('div', { style: { fontSize: 'var(--fs-sm)', marginBottom: '8px' } }, 'Butuh bantuan aktivasi?'),
      el('button', {
        class: 'btn btn--primary btn--block',
        type: 'button',
        onClick: () => window.open('https://wa.me/6285349441971?text=' + encodeURIComponent('Halo, saya ingin beli lisensi NagaPos'), '_blank'),
      }, icon('pelanggan', { size: 18 }), 'Hubungi Penjual (WhatsApp)'),
    ));

    /* ============ FOOTER ============ */

    pageEl.appendChild(el('div', {
      style: { textAlign: 'center', padding: '24px 16px', color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' },
    },
      el('div', null, 'Kode lisensi bersifat rahasia. Jangan bagikan ke orang lain.'),
    ));
  },
};

export default page;