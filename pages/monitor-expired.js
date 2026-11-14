/**
 * src/pages/monitor-expired.js
 * Dashboard monitor expired date — statistik, alert, list batch hampir expired.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDate } from '../core/utils.js';
import { openModal, closeModal } from '../ui/components/modal.js';
import { toastSuccess, toastError, toast } from '../ui/components/toast.js';
import { listExpiringBatches, getExpiryStats, markBatchDamaged } from '../services/batch-service.js';
import { navigate } from '../router.js';

const page = {
  title: 'Monitor Expired',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Monitor Expired');
    ctx.setNavbarBack?.(true);

    /** @type {'critical'|'warning'|'expired'|'all'} */
    let activeTab = 'critical';
    let expiringItems = [];
    let stats = { expired: 0, critical: 0, warning: 0, totalQtyExpiring: 0 };

    const pageEl = el('div', { class: 'kasir-page' });
    const statsBar = el('div', { class: 'kasir-toolbar' });
    const tabs = el('div', { class: 'page-tabs' });
    const list = el('div', { class: 'kasir-list' });

    pageEl.append(statsBar, tabs, list);
    root.appendChild(pageEl);

    /* ---------------- Load ---------------- */

    async function reload() {
      try {
        [expiringItems, stats] = await Promise.all([
          listExpiringBatches(ctx, { withinDays: 90 }),
          getExpiryStats(ctx),
        ]);
        renderStats();
        render();
      } catch (e) {
        toastError(e.message || 'Gagal memuat data');
      }
    }

    /* ---------------- Stats Bar ---------------- */

    function renderStats() {
      clear(statsBar);
      statsBar.appendChild(el('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          padding: '12px',
        },
      },
        statCard('Kedaluwarsa', stats.expired, 'danger', icon('warning', { size: 20 })),
        statCard('≤ 30 hari', stats.critical, 'warning', icon('utang', { size: 20 })),
        statCard('≤ 90 hari', stats.warning, 'info', icon('stok', { size: 20 })),
      ));
    }

    function statCard(label, value, color, iconEl) {
      return el('div', {
        style: {
          padding: '10px',
          background: `var(--color-${color}-soft, var(--color-surface-2))`,
          color: `var(--color-${color}, var(--color-text))`,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        },
      },
        iconEl,
        el('div', { style: { fontSize: 'var(--fs-2xl)', fontWeight: '800' } }, String(value)),
        el('div', { style: { fontSize: 'var(--fs-xs)', fontWeight: '600' } }, label),
      );
    }

    /* ---------------- Tabs ---------------- */

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'critical', label: `Kritis (${stats.critical})` },
        { id: 'warning', label: `Peringatan (${stats.warning})` },
        { id: 'expired', label: `Kedaluwarsa (${stats.expired})` },
        { id: 'all', label: `Semua (${expiringItems.length})` },
      ];
      for (const it of items) {
        tabs.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(activeTab === it.id),
          onClick: () => { activeTab = it.id; renderTabs(); render(); },
        }, it.label));
      }
    }

    /* ---------------- Render List ---------------- */

    function render() {
      clear(list);

      let filtered = expiringItems;
      if (activeTab !== 'all') {
        filtered = expiringItems.filter((e) => e.severity === activeTab);
      }

      if (filtered.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('check', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Tidak ada batch ' + (
            activeTab === 'expired' ? 'kedaluwarsa' :
            activeTab === 'critical' ? 'kritis' :
            activeTab === 'warning' ? 'peringatan' : 'perlu perhatian'
          )),
          el('div', null, 'Bagus! Semua batch dalam kondisi aman.'),
        ));
        return;
      }

      // Group by severity
      const groups = new Map();
      for (const item of filtered) {
        if (!groups.has(item.severity)) groups.set(item.severity, []);
        groups.get(item.severity).push(item);
      }

      // Render per grup
      for (const [severity, items] of groups) {
        const header = severity === 'expired' ? '⚠️ Sudah Kedaluwarsa'
          : severity === 'critical' ? '🔴 Kritis (≤ 30 hari)'
          : '🟡 Perhatian (≤ 90 hari)';
        const color = severity === 'expired' ? 'danger'
          : severity === 'critical' ? 'warning' : 'info';

        list.appendChild(el('div', {
          style: {
            padding: '12px 4px 6px',
            fontSize: 'var(--fs-xs)',
            fontWeight: '700',
            color: `var(--color-${color})`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        }, header));

        for (const item of items) {
          list.appendChild(renderItem(item));
        }
      }
    }

    function renderItem(item) {
      const { batch, product, unitName, days, severity } = item;
      const color = severity === 'expired' ? 'danger'
        : severity === 'critical' ? 'warning' : 'info';

      const daysLabel = days < 0
        ? `Lewat ${Math.abs(days)} hari`
        : days === 0 ? 'Hari ini!'
        : `${days} hari lagi`;

      return el('div', {
        class: 'list-item',
        onClick: () => openDetail(item),
      },
        el('div', {
          style: {
            width: '8px', height: '44px',
            borderRadius: 'var(--radius-sm)',
            background: `var(--color-${color})`,
            flexShrink: 0,
          },
        }),
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' }, product.name),
          el('div', { class: 'list-item__meta', style: { fontFamily: 'ui-monospace,monospace', fontSize: '11px' } },
            `${batch.batchNumber}`),
          el('div', { class: 'list-item__meta' },
            `Exp: ${formatDate(batch.expiryDate)} • ${daysLabel}`),
          el('div', { class: 'list-item__meta' },
            `Qty: ${fmtQty(batch.qtyBase)} ${unitName}`),
        ),
        el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
      );
    }

    function fmtQty(q) {
      return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
    }

    /* ---------------- Detail ---------------- */

    function openDetail(item) {
      const { batch, product, unitName, days } = item;
      const content = el('div', null,
        detailRow('Produk', product.name),
        detailRow('Batch', batch.batchNumber),
        detailRow('Sisa Qty', `${fmtQty(batch.qtyBase)} ${unitName}`),
        detailRow('Expired', formatDate(batch.expiryDate)),
        detailRow('Sisa Hari', days < 0 ? `Lewat ${Math.abs(days)} hari` : `${days} hari`),
        detailRow('HPP / unit', formatRupiah(batch.costPerBase)),
        detailRow('Total Nilai', formatRupiah(batch.qtyBase * batch.costPerBase)),
        batch.notes ? detailRow('Catatan', batch.notes) : null,
      );

      const actions = el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });

      actions.appendChild(el('button', {
        class: 'btn btn--primary btn--block',
        type: 'button',
        onClick: () => { closeModal(); navigate(`/batch-manajemen?productId=${product.id}`); },
      }, icon('stok', { size: 18 }), 'Kelola Batch Produk Ini'));

      if (days < 0) {
        actions.appendChild(el('button', {
          class: 'btn btn--danger btn--block',
          type: 'button',
          onClick: async () => {
            if (!confirm('Tandai batch ini sebagai rusak / buang? Stok akan menjadi 0.')) return;
            try {
              await markBatchDamaged(ctx, batch.id, 'Kedaluwarsa');
              closeModal();
              toastSuccess('Batch ditandai rusak');
              await reload();
            } catch (e) { toastError(e.message); }
          },
        }, icon('trash', { size: 18 }), 'Buang Batch'));
      }

      openModal({ title: 'Detail Batch', content: el('div', null, content, actions) });
    }

    function detailRow(label, value) {
      return el('div', { class: 'detail-row' },
        el('span', null, label),
        el('strong', { style: { fontWeight: '500' } }, String(value)),
      );
    }

    /* ---------------- Init ---------------- */

    renderTabs();
    await reload();

    // Auto-refresh tiap 60 detik
    const interval = setInterval(reload, 60000);
    page.unmount = () => clearInterval(interval);
  },
};

export default page;