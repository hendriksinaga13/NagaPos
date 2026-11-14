/**
 * src/ui/components/customer-viewer.js
 * Modal viewer pelanggan read-only untuk salesman.
 */

import { el, clear } from '../dom.js';
import { icon } from '../icon.js';
import { formatRupiah, formatDateTime } from '../../core/utils.js';
import { openModal } from './modal.js';
import { createSearchBox } from './search-box.js';

export async function openCustomerViewer(ctx) {
  const customers = await ctx.repos.customers.list();
  customers.sort((a, b) => a.name.localeCompare(b.name));

  const pageEl = el('div');
  const search = createSearchBox({
    placeholder: 'Cari nama / telepon…',
    autoFocus: true,
    onInput: () => render(),
  });
  const listEl = el('div', { class: 'picker-list' });

  pageEl.appendChild(search.root);
  pageEl.appendChild(el('div', { style: { height: '12px' } }));
  pageEl.appendChild(listEl);

  function render() {
    clear(listEl);
    const q = search.value.trim().toLowerCase();
    const filtered = q
      ? customers.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)))
      : customers;

    if (filtered.length === 0) {
      listEl.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
        el('div', { class: 'empty__title' }, 'Tidak ada pelanggan'),
      ));
      return;
    }

    for (const c of filtered) {
      const debtBadge = c.debt > 0
        ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } },
            `Utang ${formatRupiah(c.debt)}`)
        : null;

      listEl.appendChild(el('div', {
        class: 'cart-item',
        onClick: () => openCustomerDetail(c),
      },
        el('div', { class: 'cart-item__info' },
          el('div', { class: 'cart-item__name' }, c.name, debtBadge),
          el('div', { class: 'cart-item__meta' },
            `${c.phone || '-'} • level ${c.priceLevel}`),
          c.discountPercent > 0
            ? el('div', { class: 'cart-item__meta' }, `Diskon ${c.discountPercent}%`)
            : null,
        ),
        el('div', { class: 'cart-item__right' }, icon('chevron-right', { size: 20 })),
      ));
    }
  }

  render();

  openModal({
    title: 'Daftar Pelanggan',
    content: pageEl,
    fullHeight: true,
  });
}

function openCustomerDetail(c) {
  const content = el('div', null,
    detailRow('Nama', c.name),
    detailRow('Telepon', c.phone || '-'),
    detailRow('Alamat', c.address || '-'),
    detailRow('Level harga', c.priceLevel),
    detailRow('Diskon default', `${c.discountPercent}%`),
    detailRow('Plafon utang', formatRupiah(c.creditLimit)),
    detailRow('Utang saat ini', formatRupiah(c.debt)),
    c.notes ? detailRow('Catatan', c.notes) : null,
  );

  openModal({
    title: 'Detail Pelanggan',
    content,
  });
}

function detailRow(label, value) {
  return el('div', { class: 'detail-row' },
    el('span', null, label),
    el('strong', { style: { fontWeight: '500' } }, String(value)),
  );
}