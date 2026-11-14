/**
 * src/pages/inventori.js
 * Inventori: stock-in dengan expiry date, stock-out, opname, mutasi.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { openModal, closeModal } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { recordStockIn, recordStockOut, recordOpname } from '../services/inventory-service.js';
import { STOCK_TYPE_LABEL } from '../models/stock.js';

const page = {
  title: 'Inventori',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Inventori');
    ctx.setNavbarBack?.(false);

    /** @type {'all'|'low'|'movements'} */
    let activeTab = 'all';
    /** @type {import('../core/schema.js').Product[]} */
    let products = [];
    /** @type {import('../core/schema.js').StockMovement[]} */
    let movements = [];
    /** @type {Map<string, import('../core/schema.js').Unit[]>} */
    let unitsByProduct = new Map();

    async function reload() {
      [products, movements] = await Promise.all([
        ctx.repos.products.list(),
        ctx.repos.stockMovements.list(),
      ]);
      products.sort((a, b) => a.name.localeCompare(b.name));
      movements.sort((a, b) => b.createdAt - a.createdAt);
      movements = movements.slice(0, 100);

      const units = await ctx.repos.units.list();
      unitsByProduct = new Map();
      for (const u of units) {
        if (!unitsByProduct.has(u.productId)) unitsByProduct.set(u.productId, []);
        unitsByProduct.get(u.productId).push(u);
      }
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const searchBar = el('div', { class: 'kasir-toolbar' });
    const searchBox = createSearchBox({ placeholder: 'Cari produk…', onInput: () => render() });
    searchBar.appendChild(el('div', { class: 'kasir-toolbar__row' }, searchBox.root));

    const list = el('div', { class: 'kasir-list' });
    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Aksi stok',
      onClick: openActionMenu,
    }, icon('plus', { size: 24 }));

    /* ---------------- Tabs ---------------- */

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'all', label: 'Semua Stok' },
        { id: 'low', label: 'Menipis' },
        { id: 'movements', label: 'Mutasi' },
      ];
      for (const it of items) {
        tabs.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(activeTab === it.id),
          onClick: () => {
            activeTab = /** @type {any} */ (it.id);
            renderTabs();
            render();
          },
        }, it.label));
      }
    }

    /* ---------------- Utils ---------------- */

    function fmtQty(q) {
      return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
    }

    function fmtDate(ts) {
      if (!ts) return '-';
      return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    /* ---------------- Render list ---------------- */

    function render() {
      clear(list);
      searchBar.style.display = activeTab === 'movements' ? 'none' : '';

      if (activeTab === 'movements') {
        renderMovements();
        return;
      }

      const q = searchBox.value.trim().toLowerCase();
      let items = products;
      if (activeTab === 'low') {
        items = products.filter((p) =>
          p.active && Number(p.minStock) > 0 && Number(p.stock) <= Number(p.minStock),
        );
      }
      if (q) items = items.filter((p) => p.name.toLowerCase().includes(q));

      if (items.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('stok', { size: 48 }),
          el('div', { class: 'empty__title' },
            activeTab === 'low' ? 'Tidak ada stok menipis' : 'Belum ada produk'),
          el('div', null, activeTab === 'low'
            ? 'Semua produk dalam kondisi aman.'
            : 'Tambahkan produk dari menu Produk.'),
        ));
        return;
      }

      for (const p of items) {
        const units = unitsByProduct.get(p.id) || [];
        const base = units.find((u) => u.isBase) || units[0];
        const low = Number(p.minStock) > 0 && Number(p.stock) <= Number(p.minStock);
        list.appendChild(el('div', {
          class: 'list-item',
          onClick: () => openProductDetail(p),
        },
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' },
              p.name,
              low ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Menipis') : null,
              p.trackExpiry ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Exp') : null,
            ),
            el('div', { class: 'list-item__meta' },
              `Stok ${fmtQty(p.stock)} ${base?.name || ''} • min ${fmtQty(p.minStock)}`,
            ),
            el('div', { class: 'list-item__meta' }, `HPP ${formatRupiah(p.cost)}`),
          ),
          el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
        ));
      }
    }

    function renderMovements() {
      if (movements.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('receipt', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Belum ada mutasi'),
        ));
        return;
      }
      for (const m of movements) {
        const p = products.find((x) => x.id === m.productId);
        const units = unitsByProduct.get(m.productId) || [];
        const unit = units.find((u) => u.id === m.unitId);
        const sign = m.qtyBase >= 0 ? '+' : '';
        const typeLabel = STOCK_TYPE_LABEL[m.type] || m.type;
        list.appendChild(el('div', { class: 'list-item' },
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' }, p?.name || '(produk dihapus)'),
            el('div', { class: 'list-item__meta' },
              `${typeLabel} ${sign}${fmtQty(m.qty)} ${unit?.name || ''} • stok kini ${fmtQty(m.stockAfter)}`,
            ),
            el('div', { class: 'list-item__meta' }, formatDateTime(m.createdAt)),
          ),
        ));
      }
    }

    /* ---------------- Detail produk ---------------- */

    function openProductDetail(p) {
      const content = el('div', null,
        el('div', { class: 'detail-row' }, el('span', null, 'Stok'), el('strong', null, fmtQty(p.stock))),
        el('div', { class: 'detail-row' }, el('span', null, 'Minimum'), el('span', null, fmtQty(p.minStock))),
        el('div', { class: 'detail-row' }, el('span', null, 'HPP'), el('span', null, formatRupiah(p.cost))),
        p.trackExpiry
          ? el('div', { class: 'detail-row' },
              el('span', null, 'Lacak Expired'),
              el('strong', { style: { color: 'var(--color-warning)' } }, 'Ya'))
          : null,
      );

      const makeBtn = (label, mode) => el('button', {
        class: 'btn btn--block',
        type: 'button',
        style: { marginTop: '8px' },
        onClick: () => { closeModal(); openMovementForm(p, mode); },
      }, label);

      openModal({
        title: p.name,
        content: el('div', null,
          content,
          makeBtn('Stok Masuk', 'in'),
          makeBtn('Stok Keluar', 'out'),
          makeBtn('Opname', 'adjust'),
        ),
      });
    }

    /* ---------------- Picker produk ---------------- */

    function pickProduct(onPick) {
      const pickerList = el('div', { class: 'picker-list' });
      const search = createSearchBox({
        placeholder: 'Cari produk…',
        autoFocus: true,
        onInput: (q) => renderPicker(q.toLowerCase()),
      });

      function renderPicker(q) {
        clear(pickerList);
        const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
        if (!filtered.length) {
          pickerList.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
            el('div', { class: 'empty__title' }, 'Tidak ditemukan'),
          ));
          return;
        }
        for (const p of filtered) {
          pickerList.appendChild(el('div', {
            class: 'list-item',
            onClick: () => { closeModal(); onPick(p); },
          },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' }, p.name,
                p.trackExpiry ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Exp') : null,
              ),
              el('div', { class: 'list-item__meta' }, `Stok ${fmtQty(p.stock)}`),
            ),
            el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
          ));
        }
      }
      renderPicker('');

      openModal({
        title: 'Pilih Produk',
        content: el('div', null, search.root, pickerList),
      });
    }

    /* ---------------- Menu aksi ---------------- */

    function openActionMenu() {
      const make = (label, iconName, mode) => el('button', {
        class: 'btn btn--block', type: 'button',
        style: { marginTop: '8px' },
        onClick: () => { closeModal(); pickProduct((p) => openMovementForm(p, mode)); },
      }, icon(iconName, { size: 18 }), label);

      openModal({
        title: 'Aksi Stok',
        content: el('div', null,
          make('Stok Masuk', 'plus', 'in'),
          make('Stok Keluar', 'minus', 'out'),
          make('Opname Stok', 'edit', 'adjust'),
        ),
      });
    }

    /* ---------------- Form mutasi ---------------- */

    /**
     * @param {import('../core/schema.js').Product} product
     * @param {'in'|'out'|'adjust'} mode
     */
    function openMovementForm(product, mode) {
      const units = unitsByProduct.get(product.id) || [];
      const baseUnit = units.find((u) => u.isBase) || units[0];
      if (!baseUnit) { toastError('Satuan dasar belum ada'); return; }

      const unitSelect = el('select', { class: 'select' },
        ...units.map((u) => el('option', { value: u.id }, `${u.name} (×${u.factor})`)),
      );
      unitSelect.value = baseUnit.id;

      const qtyInput = el('input', {
        class: 'input input--number', type: 'number', min: '0', step: 'any',
        placeholder: mode === 'adjust' ? 'Stok baru (base)' : 'Jumlah',
      });
      const notesInput = el('textarea', {
        class: 'textarea', rows: 2, placeholder: 'Catatan (opsional)',
      });

      // Expiry date HANYA untuk stock-in produk yang trackExpiry
      let expiryDateInput = null;
      if (mode === 'in' && product.trackExpiry) {
        expiryDateInput = el('input', { class: 'input', type: 'date' });
      }

      const title = mode === 'in' ? 'Stok Masuk'
        : mode === 'out' ? 'Stok Keluar' : 'Opname Stok';

      const confirmBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: save,
      }, title);

      const content = el('div', null,
        el('div', { class: 'detail-row' },
          el('span', null, 'Produk'),
          el('strong', null, product.name)),
        el('div', { class: 'detail-row' },
          el('span', null, 'Stok sekarang'),
          el('strong', null, fmtQty(product.stock))),
        mode !== 'adjust'
          ? el('div', { class: 'field' },
              el('label', { class: 'field__label' }, 'Satuan'), unitSelect)
          : null,
        el('div', { class: 'field' },
          el('label', { class: 'field__label' },
            mode === 'adjust' ? 'Stok baru (base)' : 'Jumlah'),
          qtyInput),
        expiryDateInput
          ? el('div', { class: 'field' },
              el('label', { class: 'field__label' }, 'Tanggal Expired *'),
              expiryDateInput,
              el('div', { class: 'field__hint' }, 'Wajib untuk produk yang dilacak expired.'))
          : null,
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'Catatan'), notesInput),
        el('div', { style: { height: '8px' } }),
        confirmBtn,
      );

      openModal({ title, content });

      async function save() {
        try {
          const qty = Number(qtyInput.value) || 0;
          const notes = notesInput.value.trim();
          let expiryTs = 0;

          if (mode === 'in' && product.trackExpiry) {
            if (!expiryDateInput.value) throw new Error('Tanggal expired wajib diisi');
            expiryTs = new Date(expiryDateInput.value).getTime();
          }

          if (mode === 'in') {
            if (qty <= 0) throw new Error('Jumlah harus > 0');
            await recordStockIn(ctx, {
              productId: product.id,
              unitId: unitSelect.value,
              qty, notes,
              expiryDate: expiryTs,
            });
          } else if (mode === 'out') {
            if (qty <= 0) throw new Error('Jumlah harus > 0');
            await recordStockOut(ctx, {
              productId: product.id,
              unitId: unitSelect.value,
              qty, notes,
            });
          } else {
            await recordOpname(ctx, {
              productId: product.id,
              newStockBase: qty,
              notes,
            });
          }
          closeModal();
          toastSuccess('Stok diperbarui');
          await reload();
          ctx.cart?.refreshFromDb().catch(() => {});
        } catch (e) {
          toastError(e.message || 'Gagal memperbarui stok');
        }
      }
    }

    /* ---------------- Init ---------------- */

    renderTabs();
    pageEl.append(tabs, searchBar, list);
    root.appendChild(pageEl);
    pageEl.appendChild(fab);

    await reload();
  },
};

export default page;