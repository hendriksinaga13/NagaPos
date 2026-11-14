/**
 * src/pages/lainnya.js
 * Menu hub dinamis + badge PRO + license card.
 */

import { el } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { APP_INFO } from '../core/constants.js';
import { navigate } from '../router.js';
import { getCurrentUser } from '../services/auth-service.js';
import { USER_ROLES, ROLE_LABEL } from '../models/user.js';
import {
  EDITION_LABEL, EDITION_COLOR, FEATURE, hasFeatureInList,
} from '../models/license.js';

const page = {
  title: 'Lainnya',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Lainnya');
    ctx.setNavbarBack?.(false);

    const user = getCurrentUser();
    const role = user?.role || USER_ROLES.KASIR;
    const license = ctx.license || { features: ['*'], edition: 'TRIAL' };

    const groups = [
      {
        title: 'Transaksi',
        roles: ['owner', 'admin', 'kasir'],
        items: [
          { label: 'Kasir', icon: 'kasir', path: '/kasir', roles: ['owner', 'admin', 'kasir'], feature: FEATURE.KASIR },
          { label: 'Sales Order (SO)', icon: 'receipt', path: '/sales-order', roles: ['owner', 'admin', 'kasir'], feature: FEATURE.SALES_ORDER },
          { label: 'Riwayat Transaksi', icon: 'receipt', path: '/riwayat', roles: ['owner', 'admin', 'kasir'] },
          { label: 'Laporan', icon: 'chart', path: '/laporan', roles: ['owner', 'admin'], feature: FEATURE.LAPORAN },
          { label: 'Shift Kasir', icon: 'utang', path: '/shift', roles: ['owner', 'admin', 'kasir'], feature: FEATURE.SHIFT },
        ],
      },
      {
        title: 'Master Data',
        roles: ['owner', 'admin'],
        items: [
          { label: 'Diskon', icon: 'warning', path: '/diskon' },
          { label: 'Satuan Produk', icon: 'produk', path: '/satuan', feature: FEATURE.PRODUK },
          { label: 'Barcode Generator', icon: 'search', path: '/barcode-generator', feature: FEATURE.BARCODE_GEN },
          { label: 'Serial / IMEI', icon: 'receipt', path: '/serial-manajemen', feature: FEATURE.SERIAL_IMEI },
          { label: 'Monitor Expired', icon: 'utang', path: '/monitor-expired', feature: FEATURE.BATCH_EXPIRY },
          { label: 'Batch / Expired', icon: 'stok', path: '/batch-manajemen', feature: FEATURE.BATCH_EXPIRY },
          { label: 'Supplier', icon: 'stok', path: '/supplier' },
          { label: 'Pembelian', icon: 'cash', path: '/pembelian' },
        ],
      },
      {
        title: 'Sistem',
        roles: ['owner', 'admin', 'kasir'],
        items: [
          { label: 'Audit Log', icon: 'receipt', path: '/audit-log', roles: ['owner', 'admin'], feature: FEATURE.AUDIT_LOG },
          { label: 'Printer', icon: 'printer', path: '/printer', roles: ['owner', 'admin'], feature: FEATURE.PRINTER },
          { label: 'Sinkronisasi', icon: 'sync', path: '/sinkron', roles: ['owner'] },
          { label: 'Pengaturan', icon: 'settings', path: '/pengaturan', roles: ['owner'] },
        ],
      },
      {
        title: 'Akun',
        roles: ['owner', 'admin', 'kasir'],
        items: [
          { label: 'Manajemen User', icon: 'pelanggan', path: '/users', roles: ['owner'], feature: FEATURE.MULTI_USER },
          { label: 'Tentang Aplikasi', icon: 'menu', path: '/tentang', roles: ['owner', 'admin', 'kasir', 'salesman'] },
        ],
      },
    ];

    const pageEl = el('div', { class: 'page' });
    pageEl.appendChild(el('div', { class: 'page__header' }, el('h2', { class: 'page__title' }, 'Lainnya')));

    /* ============ INFO USER ============ */

    if (user) {
      const roleLabel = ROLE_LABEL[user.role] || user.role;
      pageEl.appendChild(el('div', { class: 'card', style: { marginBottom: '12px', padding: '12px' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          el('div', { style: { width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'grid', placeItems: 'center', fontWeight: '700', fontSize: '20px' } }, user.name.charAt(0).toUpperCase()),
          el('div', { style: { flex: 1 } },
            el('div', { style: { fontWeight: '700' } }, user.name),
            el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } }, `@${user.username} • ${roleLabel}`),
          ),
        ),
      ));
    }

    /* ============ LICENSE CARD ============ */

    const editionColor = EDITION_COLOR[license.edition] || 'info';
    const licenseTitle = license.isLocked ? 'Lisensi Habis'
      : license.isTrial ? `Trial (${license.daysLeft} hari)` : `${EDITION_LABEL[license.edition] || license.edition}`;

    pageEl.appendChild(el('div', {
      class: 'card',
      style: {
        marginBottom: '12px',
        padding: '12px',
        borderColor: license.isLocked ? 'var(--color-danger)' : undefined,
        cursor: 'pointer',
      },
      onClick: () => navigate('/lisensi'),
    },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        el('div', { style: { width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: `var(--color-${editionColor}-soft, var(--color-primary-soft))`, color: `var(--color-${editionColor}, var(--color-primary))`, display: 'grid', placeItems: 'center' } },
          icon('check', { size: 20 })),
        el('div', { style: { flex: 1 } },
          el('div', { style: { fontWeight: '700' } }, 'Lisensi: ' + licenseTitle),
          el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } },
            license.isLocked ? 'Aktivasi diperlukan' : 'Tap untuk kelola'),
        ),
        el('div', { style: { color: 'var(--color-text-muted)' } }, icon('chevron-right', { size: 20 })),
      ),
    ));

    /* ============ MENU GROUPS ============ */

    for (const g of groups) {
      if (!g.roles.includes(role)) continue;
      const visibleItems = g.items.filter((it) => !it.roles || it.roles.includes(role));
      if (visibleItems.length === 0) continue;
      const groupEl = el('div', null, el('div', { class: 'form-section__title', style: { marginTop: '12px' } }, g.title));

      for (const it of visibleItems) {
        const hasAccess = !it.feature || hasFeatureInList(license.features, it.feature);
        const showProBadge = it.feature && !hasAccess;

        groupEl.appendChild(el('div', {
          class: 'list-item',
          style: showProBadge ? { opacity: '0.7' } : {},
          onClick: () => navigate(it.path),
        },
          el('div', {
            style: {
              width: '40px', height: '40px',
              borderRadius: 'var(--radius-md)',
              background: showProBadge ? 'var(--color-surface-2)' : 'var(--color-primary-soft)',
              color: showProBadge ? 'var(--color-text-muted)' : 'var(--color-primary)',
              display: 'grid', placeItems: 'center',
            },
          }, icon(it.icon, { size: 20 })),
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' },
              it.label,
              showProBadge
                ? el('span', {
                    class: 'chip chip--warning',
                    style: { marginLeft: '6px', fontSize: '10px' },
                  }, '🔒 PRO')
                : null,
            ),
          ),
          el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
        ));
      }
      pageEl.appendChild(groupEl);
    }

    /* ============ FOOTER ============ */

    pageEl.appendChild(el('div', { style: { textAlign: 'center', padding: '24px 16px', color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' } },
      el('div', null, `${APP_INFO.name} v${APP_INFO.version}`),
      el('div', null, APP_INFO.copyright),
    ));

    root.appendChild(pageEl);
  },
};

export default page;