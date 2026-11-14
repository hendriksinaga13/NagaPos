/**
 * src/pages/batch-manajemen.js
 * Manajemen batch per produk: lihat semua batch, koreksi, buang.
 * 
 * Akses:
 *  - `/batch-manajemen?productId=xxx` (filter 1 produk)
 *  - `/batch-manajemen` (semua batch)
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDate, formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError, toast } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import {
  listBatches, listBatchesByProduct, adjustBatchQty, markBatchDamaged, deleteBatch,
} from '../services/batch-service.js';
import { BATCH_STATUS, BATCH_STATUS_LABEL, BATCH_STATUS_COLOR, daysToExpiry, expirySeverity } from '../models/batch.js';

const page = {
  title: 'Batch / Expired',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Batch / Expired');
    ctx.setNavbarBack?.(true);

    const filterProductId = params?.query?.get?.('productId') || '';
    let filterProduct = null;
    if (filterProductId) {
      filterProduct = await ctx.repos.products.get(filterProductId);
    }

    /** @type {'active'|'depleted'|'expired'|'all'} */
    let activeTab = 'active';
    let searchQuery = '';
    let batches = [];
    /** @type {Map<string, any>} */
    let productCache = new Map();
    /** @type {Map<string, any>} */
    let unitCache = new Map();

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const listEl = el('div', { class: 'kasir-list' });
    pageEl.append(tabs, toolbar, listEl);
    root.appendChild(pageEl);

    /* ---------------- Header produk ---------------- */

    if (filterProduct) {
      toolbar.appendChild(el('div', {
        style: { padding: '8px 0', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' },
      }, `Produk: ${filterProduct.name}`));
    }

    /* ---------------- Tabs ---------------- */

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'active', label: 'Aktif' },
        { id: 'depleted', label: 'Habis' },
        { id: 'expired', label: 'Rusak/Exp' },
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

    /* ---------------- Search ---------------- */

    const search = createSearchBox({
      placeholder: 'Cari nomor batch / catatan…',
      onInput: (v) => { searchQuery = String(v || '').toLowerCase(); render(); },
    });
    toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, search.root));

    /* ---------------- Load ---------------- */

    async function reload() {
      const status = activeTab === 'all' ? '' : activeTab;
      try {
        if (filterProductId) {
          // Untuk 1 produk, ambil semua lalu filter
          const all = await listBatchesByProduct(ctx, filterProductId, false);
          batches = status ? all.filter((b) => b.status === status) : all;
        } else {
          batches = await listBatches(ctx, { status });
        }
        // Sort by expiry terdekat
        batches.sort((a, b) => {
          const ea = a.expiryDate || Number.MAX_SAFE_INTEGER;
          const eb = b.expiryDate || Number.MAX_SAFE_INTEGER;
          return ea - eb;
        });
        await preloadCache();
        render();
      } catch (e) {
        toastError(e.message || 'Gagal memuat batch');
      }
    }

    async function preloadCache() {
      productCache = new Map();
      unitCache = new Map();
      for (const b of batches) {
        if (!productCache.has(b.productId)) {
          const p = await ctx.repos.products.get(b.productId);
          if (p) productCache.set(b.productId, p);
        }
        if (b.purchaseUnitId && !unitCache.has(b.purchaseUnitId)) {
          const u = await ctx.repos.units.get(b.purchaseUnitId);
          if (u) unitCache.set(b.purchaseUnitId, u);
        }
      }
    }

    /* ---------------- Render ---------------- */

    function render() {
      clear(listEl);

      let filtered = batches;
      if (searchQuery) {
        filtered = batches.filter((b) =>
          b.batchNumber.toLowerCase().includes(searchQuery) ||
          (b.notes || '').toLowerCase().includes(searchQuery),
        );
      }

      if (filtered.length === 0) {
        listEl.appendChild(el('div', { class: 'empty' },
          icon('stok', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Belum ada batch'),
          el('div', null, filterProductId
            ? 'Batch dibuat otomatis saat stok masuk.'
            : 'Pilih produk dari menu Produk untuk melihat batch-nya.'),
        ));
        return;
      }

      // Group by produk kalau tidak difilter
      if (!filterProductId) {
        const byProduct = new Map();
        for (const b of filtered) {
          if (!byProduct.has(b.productId)) byProduct.set(b.productId, []);
          byProduct.get(b.productId).push(b);
        }
        for (const [pid, list] of byProduct) {
          const p = productCache.get(pid);
          listEl.appendChild(el('div', {
            style: {
              padding: '12px 4px 6px',
              fontSize: 'var(--fs-xs)',
              fontWeight: '700',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            },
          }, p?.name || '(Produk dihapus)'));
          for (const b of list) listEl.appendChild(renderItem(b));
        }
      } else {
        for (const b of filtered) listEl.appendChild(renderItem(b));
      }
    }

    function renderItem(batch) {
      const product = productCache.get(batch.productId);
      const severity = batch.status === BATCH_STATUS.ACTIVE ? expirySeverity(batch) : 'ok';
      const days = daysToExpiry(batch);
      const statusColor = BATCH_STATUS_COLOR[batch.status] || 'info';
      const statusLabel = BATCH_STATUS_LABEL[batch.status] || batch.status;

      // Badge expiry kalau active & dekat expired
      const expiryBadge = batch.status === BATCH_STATUS.ACTIVE && severity !== 'ok'
        ? el('span', {
            class: `chip chip--${severity === 'expired' ? 'danger' : severity === 'critical' ? 'warning' : 'info'}`,
            style: { marginLeft: '6px' },
          }, days < 0 ? 'Kedaluwarsa' : `${days} hari`)
        : null;

      return el('div', {
        class: 'list-item',
        onClick: () => openDetail(batch),
      },
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' },
            el('span', { style: { fontFamily: 'ui-monospace,monospace', fontSize: '12px' } }, batch.batchNumber),
            el('span', { class: `chip chip--${statusColor}`, style: { marginLeft: '6px' } }, statusLabel),
            expiryBadge,
          ),
          el('div', { class: 'list-item__meta' },
            `Sisa ${fmtQty(batch.qtyBase)} / ${fmtQty(batch.initialQtyBase)} base`),
          batch.expiryDate
            ? el('div', { class: 'list-item__meta' }, `Exp: ${formatDate(batch.expiryDate)}`)
            : el('div', { class: 'list-item__meta', style: { color: 'var(--color-text-muted)' } }, 'Tanpa expired'),
          el('div', { class: 'list-item__meta' },
            `HPP ${formatRupiah(batch.costPerBase)} / base`),
        ),
        el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
      );
    }

    function fmtQty(q) {
      return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
    }

    /* ---------------- Detail ---------------- */

    function openDetail(batch) {
      const product = productCache.get(batch.productId);
      const statusLabel = BATCH_STATUS_LABEL[batch.status] || batch.status;
      const unit = unitCache.get(batch.purchaseUnitId);

      const content = el('div', null,
        detailRow('Produk', product?.name || '-'),
        detailRow('Batch', batch.batchNumber),
        detailRow('Status', statusLabel),
        detailRow('Qty Awal', `${fmtQty(batch.initialQtyBase)} base`),
        detailRow('Qty Saat Ini', `${fmtQty(batch.qtyBase)} base`),
        detailRow('HPP / base', formatRupiah(batch.costPerBase)),
        detailRow('Total Nilai', formatRupiah(batch.qtyBase * batch.costPerBase)),
        batch.purchaseQty > 0 && unit
          ? detailRow('Dibeli', `${batch.purchaseQty} ${unit.name}`)
          : null,
        batch.expiryDate ? detailRow('Expired', formatDate(batch.expiryDate)) : null,
        detailRow('Diterima', formatDateTime(batch.receivedAt)),
        batch.notes ? detailRow('Catatan', batch.notes) : null,
      );

      const actions = el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });

      if (batch.status === BATCH_STATUS.ACTIVE) {
        actions.appendChild(el('button', {
          class: 'btn btn--block', type: 'button',
          onClick: () => { closeModal(); openAdjustForm(batch); },
        }, icon('edit', { size: 18 }), 'Koreksi Qty'));

        actions.appendChild(el('button', {
          class: 'btn btn--danger btn--block', type: 'button',
          onClick: async () => {
            const reason = prompt('Alasan buang (kedaluwarsa / rusak / hilang):');
            if (reason === null) return;
            try {
              await markBatchDamaged(ctx, batch.id, reason || '');
              closeModal();
              toastSuccess('Batch ditandai rusak');
              await reload();
            } catch (e) { toastError(e.message); }
          },
        }, icon('trash', { size: 18 }), 'Buang / Rusak'));
      }

      if (batch.qtyBase === 0) {
        actions.appendChild(el('button', {
          class: 'btn btn--danger btn--block', type: 'button',
          onClick: async () => {
            if (!await confirm({
              title: 'Hapus Batch',
              message: `Hapus batch ${batch.batchNumber}?`,
              confirmText: 'Hapus', danger: true,
            })) return;
            try {
              await deleteBatch(ctx, batch.id);
              closeModal();
              toastSuccess('Batch dihapus');
              await reload();
            } catch (e) { toastError(e.message); }
          },
        }, icon('trash', { size: 18 }), 'Hapus Batch'));
      }

      openModal({ title: 'Detail Batch', content: el('div', null, content, actions) });
    }

    function openAdjustForm(batch) {
      const input = el('input', {
        class: 'input input--number', type: 'number', min: '0',
        value: String(batch.qtyBase),
      });
      const reasonInput = el('input', { class: 'input', placeholder: 'Alasan koreksi (opsional)' });
      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: async () => {
          try {
            const newQty = Math.max(0, Number(input.value) || 0);
            await adjustBatchQty(ctx, batch.id, { newQtyBase: newQty, reason: reasonInput.value.trim() });
            closeModal();
            toastSuccess('Batch dikoreksi');
            await reload();
          } catch (e) { toastError(e.message); }
        },
      }, 'Simpan');

      openModal({
        title: `Koreksi: ${batch.batchNumber}`,
        content: el('div', null,
          el('div', { style: { marginBottom: '12px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' } },
            `Qty saat ini: ${fmtQty(batch.qtyBase)} base`),
          el('div', { class: 'field' },
            el('label', { class: 'field__label' }, 'Qty Baru (base)'), input),
          el('div', { class: 'field' },
            el('label', { class: 'field__label' }, 'Alasan'), reasonInput),
          saveBtn,
        ),
      });
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
  },
};

export default page;