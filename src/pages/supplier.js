/**
 * src/pages/supplier.js — CRUD supplier sederhana.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { createSupplier, validateSupplier } from '../models/supplier.js';

const page = {
  title: 'Supplier',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Supplier');
    ctx.setNavbarBack?.(true);

    /** @type {import('../core/schema.js').Supplier[]} */
    let items = [];

    async function reload() {
      items = await ctx.repos.suppliers.list();
      items.sort((a, b) => a.name.localeCompare(b.name));
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const search = createSearchBox({ placeholder: 'Cari supplier…', onInput: () => render() });
    toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, search.root));

    const list = el('div', { class: 'kasir-list' });
    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Tambah supplier',
      onClick: () => openForm(null),
    }, icon('plus', { size: 24 }));

    pageEl.append(toolbar, list);
    root.appendChild(pageEl);
    pageEl.appendChild(fab);

    function render() {
      clear(list);
      const q = search.value.trim().toLowerCase();
      const filtered = q ? items.filter((s) => s.name.toLowerCase().includes(q)) : items;
      if (!filtered.length) {
        list.appendChild(el('div', { class: 'empty' },
          icon('stok', { size: 48 }),
          el('div', { class: 'empty__title' }, q ? 'Tidak ditemukan' : 'Belum ada supplier'),
        ));
        return;
      }
      for (const s of filtered) {
        list.appendChild(el('div', {
          class: 'list-item',
          onClick: () => openDetail(s),
        },
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' }, s.name),
            el('div', { class: 'list-item__meta' }, s.phone || s.address || '-'),
          ),
          el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
        ));
      }
    }

    function openDetail(s) {
      const editBtn = el('button', {
        class: 'btn btn--block', type: 'button',
        onClick: () => { closeModal(); openForm(s); },
      }, icon('edit', { size: 18 }), 'Edit');
      const delBtn = el('button', {
        class: 'btn btn--danger btn--block', type: 'button', style: { marginTop: '8px' },
        onClick: async () => {
          if (!await confirm({ title: 'Hapus supplier', message: `Hapus "${s.name}"?`, confirmText: 'Hapus', danger: true })) return;
          await ctx.repos.suppliers.softDelete(s.id);
          closeModal(); toastSuccess('Dihapus'); await reload();
        },
      }, icon('trash', { size: 18 }), 'Hapus');
      openModal({
        title: s.name,
        content: el('div', null,
          el('div', { class: 'detail-row' }, el('span', null, 'Telepon'), el('span', null, s.phone || '-')),
          el('div', { class: 'detail-row' }, el('span', null, 'Alamat'), el('span', null, s.address || '-')),
          el('div', { class: 'detail-row' }, el('span', null, 'Catatan'), el('span', null, s.notes || '-')),
          editBtn, delBtn,
        ),
      });
    }

    function openForm(existing) {
      const nameInput = el('input', { class: 'input', value: existing?.name || '' });
      const phoneInput = el('input', { class: 'input', value: existing?.phone || '', type: 'tel' });
      const addressInput = el('input', { class: 'input', value: existing?.address || '' });
      const notesInput = el('textarea', { class: 'textarea', rows: 2 }, existing?.notes || '');

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: async () => {
          try {
            const payload = createSupplier({
              id: existing?.id || '',
              name: nameInput.value.trim(),
              phone: phoneInput.value.trim(),
              address: addressInput.value.trim(),
              notes: notesInput.value.trim(),
              createdAt: existing?.createdAt || 0,
            });
            validateSupplier(payload);
            await ctx.repos.suppliers.save(payload);
            closeModal(); toastSuccess('Supplier disimpan'); await reload();
          } catch (e) { toastError(e.message || 'Gagal'); }
        },
      }, existing ? 'Simpan' : 'Tambah Supplier');

      openModal({
        title: existing ? 'Edit Supplier' : 'Supplier Baru',
        content: el('div', null,
          field('Nama *', nameInput),
          field('Telepon', phoneInput),
          field('Alamat', addressInput),
          field('Catatan', notesInput),
          saveBtn,
        ),
      });
    }

    function field(label, inputNode) {
      return el('div', { class: 'field' },
        el('label', { class: 'field__label' }, label),
        inputNode,
      );
    }

    await reload();
  },
};

export default page;