/**
 * src/pages/serial-manajemen.js
 * Halaman Manajemen Serial / IMEI.
 * 
 * Bisa dibuka:
 *  - `/serial-manajemen` (semua serial)
 *  - `/serial-manajemen?productId=xxx` (filter 1 produk)
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime, formatDate } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import {
  listSerials, addSerial, addSerialsBulk,
  markSerialDamaged, deleteSerial, updateSerial, getSerialStats,
} from '../services/serial-service.js';
import { SERIAL_STATUS, SERIAL_STATUS_LABEL, SERIAL_STATUS_COLOR, isWarrantyActive } from '../models/serial-number.js';

const page = {
  title: 'Serial / IMEI',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Serial / IMEI');
    ctx.setNavbarBack?.(true);

    const filterProductId = params?.query?.get?.('productId') || '';
    let filterProduct = null;
    if (filterProductId) {
      filterProduct = await ctx.repos.products.get(filterProductId);
    }

    let activeTab = 'in_stock';
    let searchQuery = '';
    let serials = [];

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const listEl = el('div', { class: 'kasir-list' });
    pageEl.append(tabs, toolbar, listEl);
    root.appendChild(pageEl);

    /* ============ Header info produk ============ */

    if (filterProduct) {
      toolbar.appendChild(el('div', {
        style: { padding: '8px 0', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' },
      }, `Produk: ${filterProduct.name}`));
    }

    /* ============ Tabs ============ */

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'in_stock', label: 'Tersedia' },
        { id: 'sold', label: 'Terjual' },
        { id: 'returned', label: 'Diretur' },
        { id: 'damaged', label: 'Rusak' },
        { id: 'all', label: 'Semua' },
      ];
      for (const it of items) {
        tabs.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(activeTab === it.id),
          onClick: () => { activeTab = it.id; renderTabs(); reload(); },
        }, it.label));
      }
    }

    /* ============ Search + Bulk Add ============ */

    const search = createSearchBox({
      placeholder: 'Cari serial / nama pembeli…',
      onInput: (v) => { searchQuery = String(v || '').toLowerCase(); render(); },
    });
    toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, search.root));

    /* ============ Load ============ */

    async function reload() {
      const status = activeTab === 'all' ? '' : activeTab;
      serials = await listSerials(ctx, {
        productId: filterProductId,
        status,
        limit: 1000,
      });
      render();
    }

    /* ============ Render ============ */

    function render() {
      clear(listEl);
      let filtered = serials;
      if (searchQuery) {
        filtered = serials.filter((s) =>
          s.serial.toLowerCase().includes(searchQuery) ||
          (s.customerName || '').toLowerCase().includes(searchQuery) ||
          (s.notes || '').toLowerCase().includes(searchQuery),
        );
      }

      if (filtered.length === 0) {
        listEl.appendChild(el('div', { class: 'empty' },
          icon('receipt', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Belum ada serial'),
          el('div', null, activeTab === 'in_stock'
            ? 'Tambahkan serial lewat tombol + di bawah.'
            : 'Tidak ada data di tab ini.'),
        ));
        return;
      }

      // Group by product
      const byProduct = new Map();
      for (const s of filtered) {
        if (!byProduct.has(s.productId)) byProduct.set(s.productId, []);
        byProduct.get(s.productId).push(s);
      }

      // Render per produk
      for (const [pid, list] of byProduct) {
        // Fetch nama produk sekali
        ctx.repos.products.get(pid).then((p) => {
          const header = listEl.querySelector(`[data-product-header="${pid}"]`);
          if (header) header.textContent = p?.name || '(Produk dihapus)';
        });

        listEl.appendChild(el('div', {
          'data-product-header': pid,
          style: {
            padding: '12px 4px 6px',
            fontSize: 'var(--fs-xs)',
            fontWeight: '700',
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        }, 'Loading…'));

        for (const s of list) listEl.appendChild(renderItem(s));
      }
    }

    function renderItem(s) {
      const statusColor = SERIAL_STATUS_COLOR[s.status] || 'info';
      const statusLabel = SERIAL_STATUS_LABEL[s.status] || s.status;
      const warrantyBadge = s.status === 'sold' && s.warrantyUntil
        ? el('span', {
            class: `chip chip--${isWarrantyActive(s) ? 'success' : 'danger'}`,
            style: { marginLeft: '6px' },
          }, isWarrantyActive(s) ? 'Garansi aktif' : 'Garansi habis')
        : null;

      const meta = [];
      if (s.status === 'sold') {
        meta.push(`Pembeli: ${s.customerName || 'Umum'}`);
        meta.push(`Terjual: ${formatDate(s.soldAt)}`);
        if (s.warrantyUntil) meta.push(`Garansi sampai: ${formatDate(s.warrantyUntil)}`);
      } else {
        if (s.purchasePrice > 0) meta.push(`HPP: ${formatRupiah(s.purchasePrice)}`);
        if (s.notes) meta.push(s.notes);
      }

      return el('div', {
        class: 'list-item',
        onClick: () => openDetail(s),
      },
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' },
            el('span', { style: { fontFamily: 'ui-monospace,monospace' } }, s.serial),
            el('span', { class: `chip chip--${statusColor}`, style: { marginLeft: '6px' } }, statusLabel),
            warrantyBadge,
          ),
          ...meta.map((m) => el('div', { class: 'list-item__meta' }, m)),
        ),
        el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
      );
    }

    /* ============ Detail ============ */

    async function openDetail(s) {
      const product = await ctx.repos.products.get(s.productId);
      const unit = await ctx.repos.units.get(s.unitId);
      const sale = s.soldSaleId ? await ctx.repos.sales.get(s.soldSaleId) : null;

      const rows = el('div', null,
        detailRow('Serial/IMEI', s.serial),
        detailRow('Produk', product?.name || '-'),
        detailRow('Unit', unit?.name || '-'),
        detailRow('Status', SERIAL_STATUS_LABEL[s.status] || s.status),
      );

      if (s.status === 'in_stock' || s.status === 'damaged') {
        if (s.purchasePrice > 0) rows.appendChild(detailRow('Harga Beli', formatRupiah(s.purchasePrice)));
        if (s.purchaseDate) rows.appendChild(detailRow('Tgl Masuk', formatDateTime(s.purchaseDate)));
      } else if (s.status === 'sold') {
        rows.appendChild(detailRow('Pembeli', s.customerName || 'Umum'));
        rows.appendChild(detailRow('Harga Jual', formatRupiah(s.soldPrice)));
        rows.appendChild(detailRow('Terjual', formatDateTime(s.soldAt)));
        if (s.warrantyUntil) {
          const active = isWarrantyActive(s);
          rows.appendChild(el('div', { class: 'detail-row' },
            el('span', null, 'Garansi'),
            el('strong', { style: { color: active ? 'var(--color-success)' : 'var(--color-danger)' } },
              `${formatDate(s.warrantyUntil)} ${active ? '(aktif)' : '(habis)'}`),
          ));
        }
        if (sale) {
          rows.appendChild(detailRow('No Nota', sale.number));
        }
      } else if (s.status === 'returned') {
        rows.appendChild(detailRow('Pembeli asal', s.customerName || 'Umum'));
        rows.appendChild(detailRow('Terjual', formatDateTime(s.soldAt)));
      }

      if (s.notes) rows.appendChild(detailRow('Catatan', s.notes));

      /* Aksi */
      const actions = el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });

      if (s.status === 'in_stock' || s.status === 'damaged') {
        actions.appendChild(el('button', {
          class: 'btn btn--block', type: 'button',
          onClick: () => { closeModal(); openEditForm(s); },
        }, icon('edit', { size: 18 }), 'Edit'));

        if (s.status === 'in_stock') {
          actions.appendChild(el('button', {
            class: 'btn btn--warning btn--block', type: 'button',
            onClick: async () => {
              const reason = prompt('Alasan rusak/hilang:');
              if (reason === null) return;
              try {
                await markSerialDamaged(ctx, s.id, reason || '');
                closeModal();
                toastSuccess('Serial ditandai rusak');
                await reload();
              } catch (e) { toastError(e.message); }
            },
          }, icon('warning', { size: 18 }), 'Tandai Rusak'));
        }

        actions.appendChild(el('button', {
          class: 'btn btn--danger btn--block', type: 'button',
          onClick: async () => {
            const ok = await confirm({
              title: 'Hapus Serial',
              message: `Hapus serial ${s.serial}?`,
              confirmText: 'Hapus', danger: true,
            });
            if (!ok) return;
            try {
              await deleteSerial(ctx, s.id);
              closeModal();
              toastSuccess('Serial dihapus');
              await reload();
            } catch (e) { toastError(e.message); }
          },
        }, icon('trash', { size: 18 }), 'Hapus'));
      }

      openModal({ title: 'Detail Serial', content: el('div', null, rows, actions) });
    }

    function detailRow(label, value) {
      return el('div', { class: 'detail-row' },
        el('span', null, label),
        el('strong', { style: { fontWeight: '500' } }, String(value)),
      );
    }

    /* ============ Form edit ============ */

    function openEditForm(s) {
      const priceInput = el('input', { class: 'input input--number', type: 'number', min: '0', value: String(s.purchasePrice || 0) });
      const notesInput = el('textarea', { class: 'textarea', rows: 2 }, s.notes || '');
      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block',
        onClick: async () => {
          try {
            await updateSerial(ctx, s.id, {
              purchasePrice: Number(priceInput.value) || 0,
              notes: notesInput.value.trim(),
            });
            closeModal();
            toastSuccess('Serial diperbarui');
            await reload();
          } catch (e) { toastError(e.message); }
        },
      }, 'Simpan');

      openModal({
        title: `Edit: ${s.serial}`,
        content: el('div', null,
          field('Harga Beli', priceInput),
          field('Catatan', notesInput),
          saveBtn,
        ),
      });
    }

    /* ============ FAB tambah serial ============ */

    async function openAddSerialDialog() {
      if (!filterProduct) {
        toastError('Buka halaman ini dari detail produk');
        return;
      }
      const products = await ctx.repos.products.list();
      const myProduct = products.find((p) => p.id === filterProduct.id);
      if (!myProduct) { toastError('Produk tidak ditemukan'); return; }

      const units = await ctx.repos.units.listByIndex('by_product', myProduct.id);
      const baseUnit = units.find((u) => u.isBase) || units[0];
      if (!baseUnit) { toastError('Produk belum punya satuan'); return; }

      const serialInput = el('textarea', {
        class: 'textarea', rows: 5,
        placeholder: 'Tempel serial di sini, 1 serial per baris (atau pisahkan dengan koma)',
      });
      const priceInput = el('input', { class: 'input input--number', type: 'number', min: '0', placeholder: 'Harga beli per unit (opsional)' });
      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block',
        onClick: async () => {
          try {
            const raw = serialInput.value.trim();
            if (!raw) throw new Error('Serial wajib diisi');
            const serials = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
            if (serials.length === 0) throw new Error('Tidak ada serial valid');
            await addSerialsBulk(ctx, {
              productId: myProduct.id,
              unitId: baseUnit.id,
              serials,
              purchasePrice: Number(priceInput.value) || 0,
            });
            closeModal();
            toastSuccess(`${serials.length} serial ditambahkan`);
            await reload();
          } catch (e) { toastError(e.message); }
        },
      }, 'Tambah Serial');

      openModal({
        title: `Tambah Serial: ${myProduct.name}`,
        content: el('div', null,
          field('Serial / IMEI', serialInput, '1 serial per baris. Contoh:\n356938035643809\n356938035643810'),
          field('Harga Beli / unit', priceInput),
          saveBtn,
        ),
      });
    }

    function field(label, inputNode, hint) {
      return el('div', { class: 'field' },
        el('label', { class: 'field__label' }, label),
        inputNode,
        hint ? el('div', { class: 'field__hint', style: { whiteSpace: 'pre-wrap' } }, hint) : null,
      );
    }

    /* FAB */
    if (filterProduct) {
      const fab = el('button', {
        class: 'fab', type: 'button', 'aria-label': 'Tambah serial',
        onClick: openAddSerialDialog,
      }, icon('plus', { size: 24 }));
      pageEl.appendChild(fab);
    }

    /* ============ Init ============ */

    renderTabs();
    await reload();
  },
};

export default page;