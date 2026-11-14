/**
 * src/pages/laporan.js
 * Laporan harian/bulanan: omzet, laba, produk terlaris, breakdown metode.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDate } from '../core/utils.js';
import { toastError } from '../ui/components/toast.js';
import { summary, bestSellers, dayRange, monthRange } from '../services/report-service.js';

const page = {
  title: 'Laporan',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Laporan');
    ctx.setNavbarBack?.(true);

    /** @type {'today'|'month'|'custom'} */
    let mode = 'today';
    let customDate = new Date().toISOString().slice(0, 10);

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    const tabsWrap = el('div', { class: 'page-tabs' });
    const content = el('div');

    pageEl.append(tabsWrap, content);

    function renderTabs() {
      clear(tabsWrap);
      const items = [
        { id: 'today', label: 'Hari Ini' },
        { id: 'month', label: 'Bulan Ini' },
        { id: 'custom', label: 'Pilih Tanggal' },
      ];
      for (const it of items) {
        tabsWrap.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(mode === it.id),
          onClick: () => { mode = /** @type {any} */ (it.id); renderTabs(); render(); },
        }, it.label));
      }
    }

    function getPeriod() {
      if (mode === 'today') return dayRange(new Date());
      if (mode === 'month') {
        const n = new Date();
        return monthRange(n.getFullYear(), n.getMonth() + 1);
      }
      return dayRange(customDate);
    }

    async function render() {
      clear(content);

      if (mode === 'custom') {
        const dateInput = el('input', {
          type: 'date', class: 'input', value: customDate,
          onInput: (e) => { customDate = e.target.value; render(); },
        });
        content.appendChild(el('div', { class: 'field', style: { marginBottom: '12px' } },
          el('label', { class: 'field__label' }, 'Tanggal'),
          dateInput,
        ));
      }

      const period = getPeriod();
      let report;
      let best;
      try {
        [report, best] = await Promise.all([
          summary(ctx, period),
          bestSellers(ctx, period, 10),
        ]);
      } catch (e) {
        toastError(e.message || 'Gagal memuat laporan');
        return;
      }

      /* Ringkasan */
      const cards = el('div', { class: 'card' },
        el('div', { class: 'card__title' },
          `Periode: ${formatDate(period.from)}`),
        el('div', { class: 'card__row' },
          el('span', null, 'Omzet'),
          el('strong', { style: { color: 'var(--color-primary)', fontSize: 'var(--fs-lg)' } },
            formatRupiah(report.revenue))),
        el('div', { class: 'card__row' },
          el('span', null, 'Transaksi'), el('strong', null, String(report.transactionCount))),
        el('div', { class: 'card__row' },
          el('span', null, 'Item terjual'), el('strong', null, String(report.itemsSold))),
        el('div', { class: 'card__row' },
          el('span', null, 'Total diskon'), el('strong', null, formatRupiah(report.discountTotal))),
        el('div', { class: 'card__row' },
          el('span', null, 'HPP'), el('strong', null, formatRupiah(report.cogs))),
        el('div', { class: 'card__row', style: { borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '8px' } },
          el('span', null, 'Laba kotor'),
          el('strong', { style: { color: 'var(--color-success)' } },
            formatRupiah(report.profit))),
        el('div', { class: 'card__row' },
          el('span', null, 'Piutang baru'), el('strong', null, formatRupiah(report.debtIssued))),
        el('div', { class: 'card__row' },
          el('span', null, 'Piutang dibayar'), el('strong', null, formatRupiah(report.debtPayments))),
      );

      content.appendChild(cards);

      /* Breakdown per metode */
      if (Object.keys(report.byMethod).length > 0) {
        const methodCard = el('div', { class: 'card', style: { marginTop: '12px' } },
          el('div', { class: 'card__title' }, 'Metode Pembayaran'),
        );
        const labelMap = {
          cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer',
          debit: 'Debit', credit: 'Utang',
        };
        for (const [m, amt] of Object.entries(report.byMethod)) {
          methodCard.appendChild(el('div', { class: 'card__row' },
            el('span', null, labelMap[m] || m),
            el('strong', null, formatRupiah(amt)),
          ));
        }
        content.appendChild(methodCard);
      }

      /* Produk terlaris */
      const bestCard = el('div', { class: 'card', style: { marginTop: '12px' } },
        el('div', { class: 'card__title' }, 'Produk Terlaris'),
      );

      if (best.length === 0) {
        bestCard.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
          el('div', { class: 'empty__title' }, 'Belum ada penjualan'),
        ));
      } else {
        best.forEach((p, i) => {
          bestCard.appendChild(el('div', { class: 'card__row' },
            el('span', null,
              el('span', { style: { color: 'var(--color-text-muted)', marginRight: '6px' } },
                `${i + 1}.`),
              p.name,
            ),
            el('span', { style: { textAlign: 'right' } },
              el('div', null, `${p.qtyBase}`),
              el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } },
                formatRupiah(p.revenue)),
            ),
          ));
        });
      }
      content.appendChild(bestCard);
    }

    renderTabs();
    await render();
  },
};

export default page;