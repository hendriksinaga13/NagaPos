/**
 * src/pages/satuan.js
 * Kelola satuan (unit) untuk satu produk.
 *  - Dapat diakses via #/satuan?productId=xxx atau standalone (pilih produk dulu).
 *  - CRUD satuan: nama, faktor, barcode, harga per level harga.
 *  - Satu produk hanya boleh punya satu unit base (factor=1, isBase=true).
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { createUnit, validateUnit } from '../models/unit.js';
import { PRICE_LEVELS } from '../models/price.js';
import { navigate } from '../router.js';

const page = {
  title: 'Satuan',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Satuan');
    ctx.setNavbarBack?.(true);

    /** @type {string|null} */
    let productId = params?.query?.get?.('productId') || null;

    const pageEl = el('div', { class: 'kasir-page' });
    root.appendChild(pageEl);

    /** Jika tidak ada productId, tampilkan pemilihan produk dulu. */
    if (!productId) {
      await renderProductPicker();
      return;
    }

    const product = await ctx.repos.products.get(productId);
    if (!product) {
      pageEl.appendChild(el('div', { class: 'empty' },
        el('div', { class: 'empty__title' }, 'Produk tidak ditemukan'),
      ));
      return;
    }

    renderUnitsForProduct(product);

    /* ---------------- Pilih produk (standalone) ---------------- */

    async function renderProductPicker() {
      const products = await ctx.repos.products.list();
      products.sort((a, b) => a.name.localeCompare(b.name));

      const toolbar = el('div', { class: 'kasir-toolbar' });
      const searchBox = createSearchBox({
        placeholder: 'Cari produk…',
        onInput: () => render(),
      });
      toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, searchBox.root));

      const list = el('div', { class: 'kasir-list' });
      pageEl.append(toolbar, list);

      function render() {
        clear(list);
        const q = searchBox.value.trim().toLowerCase();
        const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
        if (!filtered.length) {
          list.appendChild(el('div', { class: 'empty' },
            el('div', { class: 'empty__title' }, 'Tidak ada produk'),
          ));
          return;
        }
        for (const p of filtered) {
          list.appendChild(el('div', {
            class: 'list-item',
            onClick: () => navigate(`/satuan?productId=${p.id}`),
          },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' }, p.name),
              el('div', { class: 'list-item__meta' }, p.sku || p.category || '-'),
            ),
            el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
          ));
        }
      }
      render();
    }

    /* ---------------- Daftar satuan ---------------- */

    async function renderUnitsForProduct(product) {
      clear(pageEl);

      const toolbar = el('div', { class: 'kasir-toolbar' },
        el('div', { class: 'row row--between' },
          el('strong', null, product.name),
          el('span', { class: 'chip' }, `Stok ${product.stock}`),
        ),
      );
      pageEl.appendChild(toolbar);

      const list = el('div', { class: 'kasir-list' });
      pageEl.appendChild(list);

      const fab = el('button', {
        class: 'fab', type: 'button', 'aria-label': 'Tambah satuan',
        onClick: () => openForm(null),
      }, icon('plus', { size: 24 }));
      pageEl.appendChild(fab);

      async function reload() {
        const units = await ctx.repos.units.listByIndex('by_product', productId);
        units.sort((a, b) => a.factor - b.factor);
        clear(list);

        if (!units.length) {
          list.appendChild(el('div', { class: 'empty' },
            icon('produk', { size: 48 }),
            el('div', { class: 'empty__title' }, 'Belum ada satuan'),
            el('div', null, 'Tap + untuk menambah satuan.'),
          ));
          return;
        }

        for (const u of units) {
          const baseChip = u.isBase ? el('span', { class: 'chip chip--success', style: { marginLeft: '6px' } }, 'BASE') : null;
          const prices = PRICE_LEVELS
            .map((lv) => `${lv}: ${formatRupiah(u.prices?.[lv] || 0)}`)
            .join(' • ');
          list.appendChild(el('div', {
            class: 'list-item',
            onClick: () => openDetail(u),
          },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' }, u.name, baseChip),
              el('div', { class: 'list-item__meta' },
                `×${u.factor} • Barcode ${u.barcode || '-'}`,
              ),
              el('div', { class: 'list-item__meta' }, prices),
            ),
            el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
          ));
        }
      }

      async function openDetail(u) {
        const content = el('div', null,
          row('Nama', u.name),
          row('Kode', u.code),
          row('Faktor ke base', String(u.factor)),
          row('Tipe', u.isBase ? 'Satuan dasar' : 'Konversi'),
          row('Barcode', u.barcode || '-'),
          ...PRICE_LEVELS.map((lv) => row(lv, formatRupiah(u.prices?.[lv] || 0))),
        );
        const editBtn = el('button', {
          class: 'btn btn--block', type: 'button',
          onClick: () => { closeModal(); openForm(u); },
        }, icon('edit', { size: 18 }), 'Edit');
        const delBtn = el('button', {
          class: 'btn btn--danger btn--block', type: 'button',
          style: { marginTop: '8px' },
          onClick: async () => {
            if (u.isBase) {
              toastError('Satuan dasar tidak boleh dihapus');
              return;
            }
            if (!await confirm({
              title: 'Hapus satuan',
              message: `Hapus "${u.name}"?`,
              confirmText: 'Hapus', danger: true,
            })) return;
            try {
              await ctx.repos.units.softDelete(u.id);
              closeModal();
              toastSuccess('Satuan dihapus');
              await reload();
              ctx.cart?.refreshFromDb().catch(() => {});
            } catch (e) { toastError(e.message || 'Gagal menghapus'); }
          },
        }, icon('trash', { size: 18 }), 'Hapus');

        openModal({ title: 'Detail Satuan', content: el('div', null, content, editBtn, delBtn) });
      }

      function row(label, value) {
        return el('div', { class: 'detail-row' },
          el('span', null, label),
          el('span', null, value),
        );
      }

      function openForm(existing) {
        const nameInput = el('input', { class: 'input', value: existing?.name || '', placeholder: 'pcs, pak, dus…' });
        const codeInput = el('input', { class: 'input', value: existing?.code || '', placeholder: 'kode singkat' });
        const factorInput = el('input', {
          class: 'input input--number', type: 'number', min: '1', step: 'any',
          value: String(existing?.factor ?? 1),
          disabled: existing?.isBase,
        });
        const barcodeInput = el('input', {
          class: 'input', value: existing?.barcode || '',
          placeholder: 'Barcode (opsional, unik)',
        });

        const priceInputs = {};
        for (const lv of PRICE_LEVELS) {
          priceInputs[lv] = el('input', {
            class: 'input input--number', type: 'number', min: '0', step: '1',
            value: String(existing?.prices?.[lv] ?? 0),
          });
        }

        const baseToggle = el('input', {
          type: 'checkbox',
          style: { width: '22px', height: '22px' },
          disabled: !!existing,
        });
        baseToggle.checked = existing ? !!existing.isBase : false;

        const saveBtn = el('button', {
          class: 'btn btn--primary btn--block', type: 'button',
          onClick: save,
        }, existing ? 'Simpan' : 'Tambah Satuan');

        const content = el('div', null,
          field('Nama *', nameInput),
          field('Kode', codeInput),
          field('Faktor ke base *', factorInput),
          el('div', { class: 'card__row' }, el('span', null, 'Satuan dasar (base)'), baseToggle),
          field('Barcode', barcodeInput),
          el('div', { class: 'form-section' },
            el('div', { class: 'form-section__title' }, 'Harga per level'),
            ...PRICE_LEVELS.map((lv) => field(lv, priceInputs[lv])),
          ),
          saveBtn,
        );

        openModal({ title: existing ? 'Edit Satuan' : 'Satuan Baru', content });

        async function save() {
          try {
            const prices = {};
            for (const lv of PRICE_LEVELS) {
              prices[lv] = Math.max(0, Math.round(Number(priceInputs[lv].value) || 0));
            }
            const payload = createUnit({
              id: existing?.id || '',
              productId,
              name: nameInput.value.trim(),
              code: codeInput.value.trim() || nameInput.value.trim(),
              factor: existing?.isBase ? 1 : Number(factorInput.value) || 1,
              isBase: existing ? !!existing.isBase : baseToggle.checked,
              barcode: barcodeInput.value.trim() || null,
              prices,
              createdAt: existing?.createdAt || 0,
            });
            validateUnit(payload);

            // Cek barcode unik.
            if (payload.barcode) {
              const dup = await ctx.repos.units.findByIndex('by_barcode', payload.barcode);
              if (dup && dup.id !== payload.id) {
                toastError('Barcode sudah dipakai unit lain');
                return;
              }
            }

            // Jika tanda base di-set, demote unit base lama.
            if (payload.isBase && !existing) {
              const others = await ctx.repos.units.listByIndex('by_product', productId);
              for (const o of others) {
                if (o.isBase) {
                  await ctx.repos.units.save({ ...o, isBase: false, factor: o.factor });
                }
              }
              payload.factor = 1;
              // Update product.baseUnitId setelah save.
            }

            const saved = await ctx.repos.units.save(payload);
            if (saved.isBase) {
              const p = await ctx.repos.products.get(productId);
              if (p) await ctx.repos.products.save({ ...p, baseUnitId: saved.id });
            }
            closeModal();
            toastSuccess('Satuan disimpan');
            await reload();
            ctx.cart?.refreshFromDb().catch(() => {});
          } catch (e) {
            toastError(e.message || 'Gagal menyimpan');
          }
        }
      }

      function field(label, inputNode) {
        return el('div', { class: 'field' },
          el('label', { class: 'field__label' }, label),
          inputNode,
        );
      }

      await reload();
    }
  },
};

export default page;