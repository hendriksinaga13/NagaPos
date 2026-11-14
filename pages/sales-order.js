/**
 * src/pages/sales-order.js
 * Daftar SO + import dari salesman.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError, toast } from '../ui/components/toast.js';
import { processSOToCart, importSOsFromFile, readSOFile } from '../services/sales-order-service.js';
import { navigate } from '../router.js';

const page = {
  title: 'Sales Order',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Sales Order');
    ctx.setNavbarBack?.(true);

    /** @type {any[]} */
    let orders = [];
    let activeTab = 'pending';

    async function reload() {
      orders = await ctx.repos.salesOrders.list();
      orders.sort((a, b) => b.createdAt - a.createdAt);
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const list = el('div', { class: 'kasir-list' });

    const importBtn = el('button', {
      class: 'btn btn--block',
      type: 'button',
      style: { margin: '12px' },
      onClick: openImportDialog,
    }, icon('sync', { size: 18 }), 'Import SO dari Salesman');

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'pending', label: 'Menunggu' },
        { id: 'processed', label: 'Diproses' },
      ];
      for (const it of items) {
        tabs.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(activeTab === it.id),
          onClick: () => { activeTab = it.id; renderTabs(); render(); },
        }, it.label));
      }
    }

    function render() {
      clear(list);
      const filtered = orders.filter((o) => o.status === activeTab);

      if (filtered.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('receipt', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Tidak ada Sales Order'),
          el('div', { style: { fontSize: 'var(--fs-xs)' } },
            activeTab === 'pending'
              ? 'Tap "Import SO" untuk menerima dari salesman.'
              : 'Belum ada SO yang diproses.'),
        ));
        return;
      }

      for (const so of filtered) {
        list.appendChild(el('div', {
          class: 'list-item',
          onClick: () => openDetail(so),
        },
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' }, so.number,
              so.status === 'pending'
                ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'PENDING')
                : null),
            el('div', { class: 'list-item__meta' }, `${so.customerName} • ${so.items.length} item`),
            el('div', { class: 'list-item__meta' }, formatDateTime(so.createdAt)),
          ),
          el('div', { class: 'list-item__side' },
            el('strong', null, formatRupiah(so.total))),
        ));
      }
    }

    /* ============ IMPORT SO ============ */

    function openImportDialog() {
      const fileInput = el('input', {
        type: 'file',
        accept: '.json,application/json',
        style: { display: 'none' },
        onChange: handleFileSelected,
      });

      document.body.appendChild(fileInput);
      fileInput.click();

      async function handleFileSelected(e) {
        const file = e.target.files?.[0];
        fileInput.remove();
        if (!file) return;

        try {
          toast('Membaca file SO…', { type: 'info', duration: 1500 });
          const data = await readSOFile(file);
          const result = await importSOsFromFile(ctx, data);

          toastSuccess(`Import SO: +${result.imported} baru, ${result.skipped} duplikat`);
          await reload();

          if (result.imported > 0) {
            setTimeout(() => {
              activeTab = 'pending';
              renderTabs();
              render();
            }, 300);
          }
        } catch (err) {
          console.error('[import-so] gagal:', err);
          toastError(err.message || 'Gagal import SO');
        }
      }
    }

    /* ============ DETAIL ============ */

    async function openDetail(so) {
      const itemRows = so.items.map((it) => el('div', { class: 'detail-row' },
        el('span', null, `${it.productName} ${it.qty}${it.unitName}`),
        el('strong', null, formatRupiah(it.total)),
      ));

      const content = el('div', null,
        el('div', { class: 'detail-row' },
          el('span', null, 'No SO'), el('strong', null, so.number)),
        el('div', { class: 'detail-row' },
          el('span', null, 'Pelanggan'), el('span', null, so.customerName || 'Umum')),
        el('div', { class: 'detail-row' },
          el('span', null, 'Salesman'), el('span', null, so.salesmanId || '-')),
        el('div', { class: 'detail-row' },
          el('span', null, 'Tanggal'), el('span', null, formatDateTime(so.createdAt))),
        el('div', { class: 'form-section__title', style: { marginTop: '12px' } }, 'Item'),
        ...itemRows,
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
        so.notes ? el('div', { class: 'detail-row' },
          el('span', null, 'Catatan'), el('span', null, so.notes)) : null,
      );

      const actions = el('div', { style: { marginTop: '12px' } });

      if (so.status === 'pending') {
        actions.appendChild(el('button', {
          class: 'btn btn--primary btn--block',
          type: 'button',
          onClick: async () => {
            const ok = await confirm({
              title: 'Proses ke Kasir',
              message: 'Barang akan dimasukkan ke keranjang pembayaran. Lanjut?',
              confirmText: 'Proses',
            });
            if (!ok) return;
            try {
              await processSOToCart(ctx, so);
              closeModal();
              navigate('/pembayaran');
            } catch (e) {
              toastError(e.message || 'Gagal memproses SO');
            }
          },
        }, icon('kasir', { size: 18 }), 'Proses ke Kasir'));

        actions.appendChild(el('button', {
          class: 'btn btn--danger btn--block',
          type: 'button',
          style: { marginTop: '8px' },
          onClick: async () => {
            const ok = await confirm({
              title: 'Batalkan SO',
              message: 'Yakin membatalkan SO ini?',
              confirmText: 'Batalkan',
              danger: true,
            });
            if (!ok) return;
            await ctx.repos.salesOrders.patch(so.id, { status: 'cancelled' });
            closeModal();
            toastSuccess('SO dibatalkan');
            await reload();
          },
        }, icon('close', { size: 18 }), 'Batalkan SO'));
      }

      openModal({ title: 'Detail SO', content: el('div', null, content, actions) });
    }

    /* ============ INIT ============ */

    renderTabs();
    pageEl.append(tabs, importBtn, list);
    root.appendChild(pageEl);

    await reload();
  },
};

export default page;