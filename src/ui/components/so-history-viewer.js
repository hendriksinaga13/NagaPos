/**
 * src/ui/components/so-history-viewer.js
 * Modal riwayat SO untuk salesman.
 */

import { el, clear } from '../dom.js';
import { icon } from '../icon.js';
import { formatRupiah, formatDateTime, formatDate } from '../../core/utils.js';
import { openModal } from './modal.js';

export async function openSOHistoryViewer(ctx) {
  const all = await ctx.repos.salesOrders.list();
  // Sort by created desc
  all.sort((a, b) => b.createdAt - a.createdAt);

  const pageEl = el('div');

  if (all.length === 0) {
    pageEl.appendChild(el('div', { class: 'empty', style: { padding: '24px' } },
      icon('receipt', { size: 48 }),
      el('div', { class: 'empty__title' }, 'Belum ada riwayat SO'),
      el('div', { style: { fontSize: 'var(--fs-xs)' } }, 'Buat SO baru untuk mulai.'),
    ));
  } else {
    // Group by date
    let currentDate = '';
    for (const so of all) {
      const dateStr = formatDate(so.createdAt);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        pageEl.appendChild(el('div', {
          style: {
            padding: '12px 4px 6px',
            fontSize: 'var(--fs-xs)',
            fontWeight: '700',
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        }, dateStr));
      }
      pageEl.appendChild(renderSO(so));
    }
  }

  openModal({
    title: 'Riwayat Sales Order',
    content: pageEl,
    fullHeight: true,
  });
}

function renderSO(so) {
  const statusChip = so.status === 'processed'
    ? el('span', { class: 'chip chip--success', style: { marginLeft: '6px' } }, 'Diproses')
    : so.status === 'cancelled'
      ? el('span', { class: 'chip chip--danger', style: { marginLeft: '6px' } }, 'Batal')
      : el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Pending');

  return el('div', {
    class: 'list-item',
    onClick: () => openSODetail(so),
  },
    el('div', { class: 'list-item__main' },
      el('div', { class: 'list-item__title' }, so.number, statusChip),
      el('div', { class: 'list-item__meta' }, so.customerName || 'Umum'),
      el('div', { class: 'list-item__meta' }, formatDateTime(so.createdAt)),
      el('div', { class: 'list-item__meta' }, `${so.items.length} item`),
    ),
    el('div', { class: 'list-item__side' },
      el('strong', null, formatRupiah(so.total))),
  );
}

function openSODetail(so) {
  const items = so.items.map((it) => el('div', { class: 'detail-row' },
    el('span', null, `${it.productName} ${it.qty}${it.unitName}`),
    el('strong', null, formatRupiah(it.total)),
  ));

  const content = el('div', null,
    detailRow('No SO', so.number),
    detailRow('Pelanggan', so.customerName || 'Umum'),
    detailRow('Tanggal', formatDateTime(so.createdAt)),
    detailRow('Status', so.status),
    el('div', { class: 'form-section__title', style: { marginTop: '12px' } }, 'Item'),
    ...items,
    el('div', {
      class: 'detail-row',
      style: {
        marginTop: '12px',
        borderTop: '1px solid var(--color-border)',
        paddingTop: '8px',
      },
    },
      el('span', null, 'Total'),
      el('strong', null, formatRupiah(so.total))),
  );

  openModal({
    title: 'Detail SO',
    content,
  });
}

function detailRow(label, value) {
  return el('div', { class: 'detail-row' },
    el('span', null, label),
    el('strong', { style: { fontWeight: '500' } }, String(value)),
  );
}