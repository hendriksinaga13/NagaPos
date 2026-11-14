/**
 * src/pages/users.js
 * Manajemen user (khusus Owner).
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import {
  listUsers, createNewUser, updateUser, deleteUser, getCurrentUser,
} from '../services/auth-service.js';
import { USER_ROLES, ROLE_LABEL, ROLE_COLOR } from '../models/user.js';

const page = {
  title: 'Manajemen User',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Manajemen User');
    ctx.setNavbarBack?.(true);

    const current = getCurrentUser();
    if (!current || current.role !== USER_ROLES.OWNER) {
      root.appendChild(el('div', { class: 'empty' },
        icon('warning', { size: 48 }),
        el('div', { class: 'empty__title' }, 'Akses Ditolak'),
        el('div', null, 'Hanya Pemilik (Owner) yang bisa membuka halaman ini.'),
      ));
      return;
    }

    /** @type {import('../models/user.js').USER_DEFAULTS[]} */
    let users = [];

    async function reload() {
      users = await listUsers(ctx);
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const list = el('div', { class: 'kasir-list' });
    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Tambah user',
      onClick: () => openForm(null),
    }, icon('plus', { size: 24 }));

    pageEl.append(list);
    root.appendChild(pageEl);
    pageEl.appendChild(fab);

    function render() {
      clear(list);
      if (users.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('pelanggan', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Belum ada user'),
        ));
        return;
      }

      for (const u of users) {
        const isMe = u.id === current.id;
        const inactive = !u.active;
        const roleBadge = el('span', {
          class: `chip chip--${ROLE_COLOR[u.role] || ''}`,
          style: { marginLeft: '6px' },
        }, ROLE_LABEL[u.role] || u.role);

        list.appendChild(el('div', {
          class: 'list-item',
          onClick: () => openDetail(u),
        },
          el('div', {
            style: {
              width: '40px', height: '40px', borderRadius: '50%',
              background: inactive ? 'var(--color-surface-2)' : 'var(--color-primary-soft)',
              color: inactive ? 'var(--color-text-muted)' : 'var(--color-primary)',
              display: 'grid', placeItems: 'center', fontWeight: '700', flexShrink: 0,
            },
          }, u.name.charAt(0).toUpperCase()),
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' },
              u.name,
              isMe ? el('span', { class: 'chip chip--success', style: { marginLeft: '6px' } }, 'Anda') : null,
              roleBadge,
              inactive ? el('span', { class: 'chip', style: { marginLeft: '6px' } }, 'Nonaktif') : null,
            ),
            el('div', { class: 'list-item__meta' }, `@${u.username}`),
            u.lastLogin
              ? el('div', { class: 'list-item__meta' }, `Login terakhir: ${formatDateTime(u.lastLogin)}`)
              : el('div', { class: 'list-item__meta' }, 'Belum pernah login'),
          ),
          el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
        ));
      }
    }

    /* ---------------- Detail ---------------- */

    function openDetail(u) {
      const isMe = u.id === current.id;

      const content = el('div', null,
        row('Nama', u.name),
        row('Username', '@' + u.username),
        row('Role', ROLE_LABEL[u.role] || u.role),
        row('Status', u.active ? 'Aktif' : 'Nonaktif'),
        row('Login terakhir', u.lastLogin ? formatDateTime(u.lastLogin) : '-'),
        row('Dibuat', formatDateTime(u.createdAt)),
      );

      const actions = el('div', { style: { marginTop: '12px' } });

      actions.appendChild(el('button', {
        class: 'btn btn--block', type: 'button',
        style: { marginBottom: '8px' },
        onClick: () => { closeModal(); openForm(u); },
      }, icon('edit', { size: 18 }), 'Edit User'));

      if (!isMe) {
        actions.appendChild(el('button', {
          class: 'btn btn--danger btn--block', type: 'button',
          onClick: async () => {
            if (!await confirm({
              title: 'Hapus user',
              message: `Hapus "${u.name}" (@${u.username})?`,
              confirmText: 'Hapus', danger: true,
            })) return;
            try {
              await deleteUser(ctx, u.id);
              closeModal();
              toastSuccess('User dihapus');
              await reload();
            } catch (e) { toastError(e.message || 'Gagal menghapus'); }
          },
        }, icon('trash', { size: 18 }), 'Hapus User'));
      }

      openModal({
        title: 'Detail User',
        content: el('div', null, content, actions),
      });
    }

    function row(label, value) {
      return el('div', { class: 'detail-row' },
        el('span', null, label),
        el('strong', { style: { fontWeight: '500' } }, value),
      );
    }

    /* ---------------- Form ---------------- */

    function openForm(existing) {
      const isNew = !existing;

      const nameInput = el('input', {
        class: 'input', value: existing?.name || '',
        placeholder: 'Nama lengkap',
      });
      const usernameInput = el('input', {
        class: 'input', value: existing?.username || '',
        placeholder: 'huruf kecil, 3-20 karakter',
        disabled: !isNew,
        style: !isNew ? { opacity: '0.6' } : {},
      });
      const pinInput = el('input', {
        class: 'input', type: 'password', inputmode: 'numeric', maxLength: 6,
        placeholder: isNew ? 'PIN 4-6 digit' : 'Kosongkan jika tidak ganti PIN',
      });

      const roleSelect = el('select', { class: 'select' },
        el('option', { value: USER_ROLES.KASIR }, 'Kasir'),
        el('option', { value: USER_ROLES.ADMIN }, 'Admin'),
        el('option', { value: USER_ROLES.SALESMAN }, 'Salesman'),
        el('option', { value: USER_ROLES.OWNER }, 'Owner'),
      );
      roleSelect.value = existing?.role || USER_ROLES.KASIR;

      const activeToggle = el('input', {
        type: 'checkbox', style: { width: '22px', height: '22px' },
      });
      activeToggle.checked = existing ? !!existing.active : true;

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: save,
      }, isNew ? 'Tambah User' : 'Simpan');

      const content = el('div', null,
        field('Nama *', nameInput),
        field('Username *', usernameInput, isNew ? 'Hanya huruf kecil, angka, titik, strip, underscore' : 'Username tidak bisa diubah'),
        field(isNew ? 'PIN *' : 'PIN baru (opsional)', pinInput,
          '4-6 digit angka. Gunakan PIN yang mudah diingat.'),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'Role'),
          roleSelect),
        el('div', { class: 'card__row', style: { padding: '8px 0' } },
          el('span', null, 'Aktif'), activeToggle),
        saveBtn,
      );

      openModal({
        title: isNew ? 'Tambah User' : 'Edit User',
        content,
      });

      async function save() {
        try {
          if (isNew) {
            await createNewUser(ctx, {
              name: nameInput.value,
              username: usernameInput.value,
              pin: pinInput.value,
              role: roleSelect.value,
            });
          } else {
            const fields = {
              name: nameInput.value,
              role: roleSelect.value,
              active: activeToggle.checked,
            };
            if (pinInput.value) fields.pin = pinInput.value;
            await updateUser(ctx, existing.id, fields);
          }
          closeModal();
          toastSuccess('User disimpan');
          await reload();
        } catch (e) {
          toastError(e.message || 'Gagal menyimpan');
        }
      }
    }

    function field(label, inputNode, hint) {
      return el('div', { class: 'field' },
        el('label', { class: 'field__label' }, label),
        inputNode,
        hint ? el('div', { class: 'field__hint' }, hint) : null,
      );
    }

    await reload();
  },
};

export default page;