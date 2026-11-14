/**
 * src/ui/components/product-viewer.js
 * Modal viewer produk read-only untuk salesman.
 */

import { el, clear } from '../dom.js';
import { icon } from '../icon.js';
import { formatRupiah } from '../../core/utils.js';
import { openModal, closeModal } from './modal.js';
import { createSearchBox } from './search-box.js';
import { unitPrice } from '../../models/unit.js';

/**
 * Buka modal viewer produk.
 * @param {object} ctx
 */
export async function openProductViewer(ctx) {
  const products = await ctx.repos.products.list();
  const units = await ctx.repos.units.list();
  const unitsByProduct = new Map();
  for (const u of units) {
    if (!unitsByProduct.has(u.productId)) unitsByProduct.set(u.productId, []);
    unitsByProduct.get(u.productId).push(u);
  }

  // Sort by name
  products.sort((a, b) => a.name.localeCompare(b.name));

  const pageEl = el('div');
  const search = createSearchBox({
    placeholder: 'Cari produk…',
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
      ? products.filter((p) =>
          p.active && (
            p.name.toLowerCase().includes(q) ||
            (p.sku && p.sku.toLowerCase().includes(q)) ||
            (p.category && p.category.toLowerCase().includes(q))
          ))
      : products.filter((p) => p.active);

    if (filtered.length === 0) {
      listEl.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
        el('div', { class: 'empty__title' }, 'Tidak ditemukan'),
      ));
      return;
    }

    for (const p of filtered) {
      const pUnits = unitsByProduct.get(p.id) || [];
      const baseUnit = pUnits.find((u) => u.isBase) || pUnits[0];
      const price = baseUnit ? unitPrice(baseUnit, 'retail') : 0;
      const low = Number(p.minStock) > 0 && Number(p.stock) <= Number(p.minStock);

      listEl.appendChild(el('div', {
        class: 'cart-item',
        onClick: () => openProductDetail(p, pUnits),
      },
        el('div', { class: 'cart-item__info' },
          el('div', { class: 'cart-item__name' },
            p.name,
            low ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Menipis') : null,
          ),
          el('div', { class: 'cart-item__meta' },
            `${formatRupiah(price)} / ${baseUnit?.name || 'unit'} • stok ${fmtQty(p.stock)}`),
          p.category ? el('div', { class: 'cart-item__meta', style: { fontSize: '11px' } }, p.category) : null,
        ),
        el('div', { class: 'cart-item__right' }, icon('chevron-right', { size: 20 })),
      ));
    }
  }

  function fmtQty(q) {
    return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
  }

  render();

  openModal({
    title: 'Daftar Produk',
    content: pageEl,
    fullHeight: true,
  });
}

/**
 * Tampilkan detail produk (modal kedua).
 */
function openProductDetail(product, units) {
  const baseUnit = units.find((u) => u.isBase) || units[0];
  const basePrice = baseUnit ? unitPrice(baseUnit, 'retail') : 0;

  const content = el('div', null,
    detailRow('Nama', product.name),
    product.sku ? detailRow('SKU', product.sku) : null,
    product.category ? detailRow('Kategori', product.category) : null,
    detailRow('Stok', fmtQty(product.stock)),
    detailRow('Stok minimum', fmtQty(product.minStock)),
    detailRow('Harga jual retail', formatRupiah(basePrice)),
    product.trackSerial ? detailRow('Track Serial', 'Ya') : null,
    product.trackExpiry ? detailRow('Track Expired', 'Ya') : null,
  );

  const unitsContent = el('div', { style: { marginTop: '12px' } });
  unitsContent.appendChild(el('div', { class: 'form-section__title' }, 'Satuan & Harga'));
  for (const u of units) {
    const retail = unitPrice(u, 'retail');
    unitsContent.appendChild(el('div', { class: 'detail-row' },
      el('span', null, u.name, u.isBase ? el('span', { class: 'chip chip--success', style: { marginLeft: '4px', fontSize: '9px' } }, 'BASE') : null),
      el('strong', null, formatRupiah(retail)),
    ));
  }

  openModal({
    title: product.name,
    content: el('div', null, content, unitsContent),
  });
}

function detailRow(label, value) {
  return el('div', { class: 'detail-row' },
    el('span', null, label),
    el('strong', { style: { fontWeight: '500' } }, String(value)),
  );
}

function fmtQty(q) {
  return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
}