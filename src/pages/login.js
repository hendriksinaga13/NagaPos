/**
 * src/pages/login.js
 * Halaman login: username + PIN.
 * Kalau belum ada user sama sekali, tampilkan wizard buat akun Owner.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { createNumpad } from '../ui/components/numpad.js';
import { toastError, toastSuccess } from '../ui/components/toast.js';
import { login, listUsers, ensureSeedUser } from '../services/auth-service.js';
import { USER_ROLES, ROLE_LABEL } from '../models/user.js';
import { createNewUser } from '../services/auth-service.js';
import { navigate } from '../router.js';

const page = {
  title: 'Masuk',
  layout: 'plain',
  flush: true,

  async mount(root, params, ctx) {
    // Pastikan minimal ada 1 user (migrasi otomatis)
    const seed = await ensureSeedUser(ctx);
    if (seed.seeded) {
      if (seed.defaultPin) {
        toastSuccess(`Akun Owner dibuat. PIN default: ${seed.defaultPin}`);
      }
    }

    const users = await listUsers(ctx);

    // Kalau belum ada user sama sekali (jarang terjadi), buat wizard
    if (users.length === 0) {
      renderSetupWizard(root, ctx);
      return;
    }

    // Kalau cuma 1 user, langsung PIN saja (pilih user otomatis)
    // Kalau lebih, tampilkan pilihan user
    if (users.length === 1) {
      renderPinEntry(root, ctx, users[0]);
    } else {
      renderUserPicker(root, ctx, users);
    }
  },
};

/* ===================== Wizard setup ===================== */

function renderSetupWizard(root, ctx) {
  const nameInput = el('input', { class: 'input', placeholder: 'Nama Anda' });
  const userInput = el('input', { class: 'input', placeholder: 'username (huruf kecil)' });
  const pinInput = el('input', {
    class: 'input', type: 'password', inputmode: 'numeric', maxLength: 6,
    placeholder: 'PIN 4-6 digit',
  });

  const saveBtn = el('button', {
    class: 'btn btn--primary btn--lg btn--block',
    onClick: async () => {
      try {
        await ensureSeedUser(ctx);
        // Buat user pertama
        const salt = (await import('../core/crypto-util.js')).generateSalt();
        const hashPin = (await import('../core/crypto-util.js')).hashPin;
        const pinHash = await hashPin(String(pinInput.value), salt);

        const { createUser, validateUser } = await import('../models/user.js');
        const u = createUser({
          name: nameInput.value.trim() || 'Pemilik',
          username: userInput.value.trim().toLowerCase(),
          pinHash,
          pinSalt: salt,
          role: USER_ROLES.OWNER,
        });
        validateUser(u);
        await ctx.repos.users.save(u);
        toastSuccess('Akun Owner dibuat. Silakan login.');
        location.reload();
      } catch (e) {
        toastError(e.message || 'Gagal membuat akun');
      }
    },
  }, 'Buat Akun Owner');

  root.appendChild(el('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: '24px', textAlign: 'center',
    },
  },
    el('img', { src: 'assets/logo/logo.svg', width: 160 }),
    el('h1', { style: { marginTop: '16px', fontSize: '22px' } }, 'Selamat Datang di NagaPos'),
    el('p', { style: { color: 'var(--color-text-muted)', marginBottom: '24px' } },
      'Buat akun Pemilik (Owner) terlebih dahulu.'),
    el('div', { style: { width: '100%', maxWidth: '360px' } },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Nama'), nameInput),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Username'), userInput),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'PIN'), pinInput),
      saveBtn,
    ),
  ));
}

/* ===================== Pilih user ===================== */

function renderUserPicker(root, ctx, users) {
  const container = el('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: '24px',
    },
  });

  container.appendChild(el('img', { src: 'assets/logo/logo.svg', width: 140 }));
  container.appendChild(el('div', {
    style: { marginTop: '16px', fontSize: 'var(--fs-lg)', fontWeight: '600', marginBottom: '16px' },
  }, 'Pilih Akun'));

  const activeUsers = users.filter((u) => u.active);
  for (const u of activeUsers) {
    container.appendChild(el('div', {
      class: 'list-item',
      style: { width: '100%', maxWidth: '360px' },
      onClick: () => {
        clear(container);
        renderPinEntry(container, ctx, u);
      },
    },
      el('div', {
        style: {
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'var(--color-primary-soft)', color: 'var(--color-primary)',
          display: 'grid', placeItems: 'center', fontWeight: '700',
        },
      }, u.name.charAt(0).toUpperCase()),
      el('div', { class: 'list-item__main' },
        el('div', { class: 'list-item__title' }, u.name),
        el('div', { class: 'list-item__meta' },
          `${u.username} • ${ROLE_LABEL[u.role] || u.role}`),
      ),
      el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
    ));
  }

  root.appendChild(container);
}

/* ===================== PIN entry ===================== */

function renderPinEntry(root, ctx, user) {
  let currentPin = '';
  let remember = false;

  const dots = el('div', {
    style: { display: 'flex', gap: '12px', justifyContent: 'center', margin: '24px 0', height: '24px' },
  });
  const updateDots = () => {
    dots.innerHTML = '';
    for (let i = 0; i < Math.max(4, currentPin.length); i++) {
      dots.appendChild(el('div', {
        style: {
          width: '16px', height: '16px', borderRadius: '50%',
          background: i < currentPin.length ? 'var(--color-primary)' : 'var(--color-border)',
          transition: 'background 0.15s',
        },
      }));
    }
  };
  updateDots();

  const numpad = createNumpad({
    allowDecimal: false,
    enterLabel: 'Masuk',
    onInput: (val) => {
      if (val.length <= 6) { currentPin = val; updateDots(); }
      if (val.length === 6) setTimeout(() => doLogin(val), 150);
    },
    onEnter: (val) => doLogin(val),
  });

  const rememberToggle = el('input', { type: 'checkbox' });
  rememberToggle.addEventListener('change', () => { remember = rememberToggle.checked; });

  async function doLogin(pin) {
    try {
      await login(ctx, user.username, pin, remember);
      toastSuccess(`Selamat datang, ${user.name}`);
      navigate('/kasir');
    } catch (e) {
      toastError(e.message || 'Login gagal');
      currentPin = '';
      numpad.clear();
      updateDots();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  }

  clear(root);
  root.appendChild(el('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: '24px', textAlign: 'center',
    },
  },
    el('img', { src: 'assets/logo/logo.svg', width: 140 }),
    el('div', { style: { marginTop: '16px', fontSize: 'var(--fs-lg)', fontWeight: '600' } },
      user.name),
    el('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' } },
      ROLE_LABEL[user.role] || user.role),
    dots,
    el('div', { style: { width: '100%', maxWidth: '320px' } }, numpad.root),
    el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '16px', fontSize: 'var(--fs-sm)' } },
      rememberToggle, 'Ingat saya (tetap login)'),
    el('button', {
      class: 'btn btn--ghost',
      style: { marginTop: '8px', fontSize: 'var(--fs-sm)' },
      onClick: () => location.reload(),
    }, 'Ganti akun'),
  ));
}

export default page;