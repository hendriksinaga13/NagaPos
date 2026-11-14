/**
 * src/pages/diskon.js
 * CRUD diskon (product/category/customer/sale, percent/nominal).
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createDiscount, validateDiscount, DISCOUNT_SCOPE, DISCOUNT_TYPE } from '../models/discount.js';

const page = {
  title: 'Diskon',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Diskon');
    ctx.setNavbarBack?.(true);

    /** @type {import('../core/schema.js').Discount[]} */
    let discounts = [];
    let products = [];
    let customers = [];

    async function reload() {
      [discounts, products, customers] = await Promise.all([
        ctx.repos.discounts.list(),
        ctx.repos.products.list(),
        ctx.repos.customers.list(),
      ]);
      discounts.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const list = el('div', { class: 'kasir-list' });
    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Tambah diskon',
      onClick: () => openForm(null),
    }, icon('plus', { size: 24 }));

    /** @type {'all'|'product'|'category'|'customer'|'sale'} */
    let activeTab = 'all';

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'all', label: 'Semua' },
        { id: 'product', label: 'Produk' },
        { id: 'category', label: 'Kategori' },
        { id: 'customer', label: 'Pelanggan' },
        { id: 'sale', label: 'Nota' },
      ];
      for (const it of items) {
        tabs.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(activeTab === it.id),
          onClick: () => { activeTab = /** @type {any} */ (it.id); renderTabs(); render(); },
        }, it.label));
      }
    }

    function render() {
      clear(list);
      const filtered = activeTab === 'all' ? discounts : discounts.filter((d) => d.scope === activeTab);

      if (filtered.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('warning', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Belum ada diskon'),
          el('div', null, 'Tap + untuk menambah diskon.'),
        ));
        return;
      }

      for (const d of filtered) list.appendChild(renderItem(d));
    }

    function renderItem(d) {
      const valueLabel = d.type === DISCOUNT_TYPE.PERCENT
        ? `${d.value}%`
        : formatRupiah(d.value);
      const scopeLabel = {
        product: 'Produk', category: 'Kategori',
        customer: 'Pelanggan', sale: 'Nota',
      }[d.scope] || d.scope;

      const target = d.targetId
        ? (d.scope === 'product'
            ? (products.find((p) => p.id === d.targetId)?.name || d.targetId)
            : d.scope === 'customer'
              ? (customers.find((c) => c.id === d.targetId)?.name || d.targetId)
              : d.targetId)
        : 'Semua';

      return el('div', {
        class: 'list-item',
        onClick: () => openForm(d),
      },
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' },
            d.name,
            !d.active
              ? el('span', { class: 'chip', style: { marginLeft: '6px' } }, 'Nonaktif')
              : null,
            d.stackable === false
              ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Non-stack')
              : null,
          ),
          el('div', { class: 'list-item__meta' },
            `${scopeLabel} • ${target} • ${valueLabel} • prioritas ${d.priority}`,
          ),
          (d.minQty > 0 || d.minSubtotal > 0)
            ? el('div', { class: 'list-item__meta' },
                [
                  d.minQty > 0 ? `min qty ${d.minQty}` : null,
                  d.minSubtotal > 0 ? `min ${formatRupiah(d.minSubtotal)}` : null,
                ].filter(Boolean).join(' • '),
              )
            : null,
        ),
        el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
      );
    }

    function tsToLocalInput(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function localInputToTs(s) {
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.getTime();
    }

    function openForm(existing) {
      const nameInput = el('input', { class: 'input', value: existing?.name || '' });

      const scopeSelect = el('select', { class: 'select' },
        el('option', { value: 'product' }, 'Produk'),
        el('option', { value: 'category' }, 'Kategori'),
        el('option', { value: 'customer' }, 'Pelanggan'),
        el('option', { value: 'sale' }, 'Nota (global)'),
      );
      scopeSelect.value = existing?.scope || 'sale';

      const typeSelect = el('select', { class: 'select' },
        el('option', { value: 'percent' }, 'Persen'),
        el('option', { value: 'nominal' }, 'Nominal (Rp)'),
      );
      typeSelect.value = existing?.type || 'percent';

      const valueInput = el('input', {
        class: 'input input--number', type: 'number', min: '0', step: 'any',
        value: String(existing?.value ?? 0),
      });

      const targetWrap = el('div');
      const targetProduct = el('select', { class: 'select' },
        el('option', { value: '' }, '— Pilih produk —'),
        ...products.map((p) => el('option', { value: p.id }, p.name)),
      );
      const targetCategory = el('input', {
        class: 'input', placeholder: 'Kategori', value: '',
      });
      const targetCustomer = el('select', { class: 'select' },
        el('option', { value: '' }, '— Pilih pelanggan —'),
        ...customers.map((c) => el('option', { value: c.id }, c.name)),
      );

      function refreshTarget() {
        clear(targetWrap);
        const scope = scopeSelect.value;
        if (scope === 'product') {
          targetProduct.value = existing?.scope === 'product' ? (existing.targetId || '') : '';
          targetWrap.appendChild(field('Produk', targetProduct));
        } else if (scope === 'category') {
          targetCategory.value = existing?.scope === 'category' ? (existing.targetId || '') : '';
          targetWrap.appendChild(field('Nama kategori', targetCategory));
        } else if (scope === 'customer') {
          targetCustomer.value = existing?.scope === 'customer' ? (existing.targetId || '') : '';
          targetWrap.appendChild(field('Pelanggan', targetCustomer));
        } else {
          targetWrap.appendChild(el('div', { class: 'field__hint' }, 'Berlaku untuk semua nota.'));
        }
      }
      scopeSelect.addEventListener('change', refreshTarget);
      refreshTarget();

      const priorityInput = el('input', {
        class: 'input input--number', type: 'number', step: '1',
        value: String(existing?.priority ?? 0),
      });
      const minQtyInput = el('input', {
        class: 'input input--number', type: 'number', min: '0', step: 'any',
        value: String(existing?.minQty ?? 0),
      });
      const minSubtotalInput = el('input', {
        class: 'input input--number', type: 'number', min: '0', step: '1',
        value: String(existing?.minSubtotal ?? 0),
      });
      const validFromInput = el('input', {
        type: 'datetime-local', class: 'input',
        value: tsToLocalInput(existing?.validFrom),
      });
      const validToInput = el('input', {
        type: 'datetime-local', class: 'input',
        value: tsToLocalInput(existing?.validTo),
      });
      const activeToggle = el('input', {
        type: 'checkbox', style: { width: '22px', height: '22px' },
      });
      activeToggle.checked = existing ? !!existing.active : true;
      const stackableToggle = el('input', {
        type: 'checkbox', style: { width: '22px', height: '22px' },
      });
      stackableToggle.checked = existing ? existing.stackable !== false : true;

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: save,
      }, existing ? 'Simpan' : 'Tambah Diskon');

      const content = el('div', null,
        field('Nama *', nameInput),
        field('Cakupan', scopeSelect),
        targetWrap,
        el('div', { class: 'grid grid--2' },
          field('Tipe', typeSelect),
          field('Nilai', valueInput),
        ),
        el('div', { class: 'grid grid--2' },
          field('Prioritas', priorityInput),
          field('Min Qty', minQtyInput),
        ),
        field('Min Subtotal (Rp)', minSubtotalInput),
        el('div', { class: 'grid grid--2' },
          field('Berlaku dari', validFromInput),
          field('Berlaku sampai', validToInput),
        ),
        el('div', { class: 'card__row' }, el('span', null, 'Aktif'), activeToggle),
        el('div', { class: 'card__row' }, el('span', null, 'Bisa digabung'), stackableToggle),
        saveBtn,
      );

      openModal({ title: existing ? 'Edit Diskon' : 'Diskon Baru', content });

      async function save() {
        try {
          const scope = scopeSelect.value;
          let targetId = '';
          if (scope === 'product') targetId = targetProduct.value;
          else if (scope === 'category') targetId = targetCategory.value.trim();
          else if (scope === 'customer') targetId = targetCustomer.value;

          if (scope !== 'sale' && !targetId) {
            throw new Error('Target diskon wajib dipilih');
          }
          if (existing && existing.targetId !== targetId) {
            // boleh berubah, tidak apa-apa
          }

          const payload = createDiscount({
            id: existing?.id || '',
            name: nameInput.value.trim(),
            scope,
            targetId,
            type: typeSelect.value,
            value: Math.max(0, Number(valueInput.value) || 0),
            priority: parseInt(priorityInput.value, 10) || 0,
            minQty: Number(minQtyInput.value) || 0,
            minSubtotal: Math.max(0, Math.round(Number(minSubtotalInput.value) || 0)),
            validFrom: localInputToTs(validFromInput.value),
            validTo: localInputToTs(validToInput.value),
            active: activeToggle.checked,
            stackable: stackableToggle.checked,
            createdAt: existing?.createdAt || 0,
          });
          validateDiscount(payload);
          await ctx.repos.discounts.save(payload);
          closeModal();
          toastSuccess('Diskon disimpan');
          await reload();
          ctx.cart?.refreshFromDb().catch(() => {});
        } catch (e) {
          toastError(e.message || 'Gagal menyimpan diskon');
        }
      }
    }

    function field(label, inputNode) {
      return el('div', { class: 'field' },
        el('label', { class: 'field__label' }, label),
        inputNode,
      );
    }

    renderTabs();
    pageEl.append(tabs, list);
    root.appendChild(pageEl);
    pageEl.appendChild(fab);

    await reload();
  },
};

export default page;