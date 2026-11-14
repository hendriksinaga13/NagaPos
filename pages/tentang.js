import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { openModal, closeModal } from '../ui/components/modal.js';
import { toast, toastSuccess, toastError } from '../ui/components/toast.js';
import { APP_INFO } from '../core/constants.js';
import { navigate } from '../router.js';

const page = {
  title: 'Tentang',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Tentang');
    ctx.setNavbarBack?.(true);

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    pageEl.appendChild(el('div', { style: { textAlign: 'center', padding: '24px 16px 16px' } },
      el('img', { src: 'assets/logo/logo.svg', alt: 'Logo', style: { width: '120px', height: 'auto', margin: '0 auto 12px' } }),
      el('div', { style: { fontSize: 'var(--fs-xl)', fontWeight: '800' } }, APP_INFO.name),
      el('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)', marginTop: '4px' } }, APP_INFO.tagline),
      el('div', { class: 'chip', style: { marginTop: '12px' } }, `Versi ${APP_INFO.version}`),
    ));

    pageEl.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card__title' }, 'Tentang Aplikasi'),
      el('p', { style: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' } }, APP_INFO.description),
      el('div', { class: 'card__row', style: { marginTop: '12px' } }, el('span', null, 'Versi'), el('strong', null, APP_INFO.version)),
      el('div', { class: 'card__row' }, el('span', null, 'Tanggal Rilis'), el('strong', null, APP_INFO.buildDate)),
      el('div', { class: 'card__row' }, el('span', null, 'Lisensi'), el('strong', null, APP_INFO.license)),
    ));

    /* ============ LEGAL ============ */
    pageEl.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card__title' }, 'Legal'),
      el('button', {
        class: 'btn btn--ghost btn--block',
        type: 'button',
        style: { marginBottom: '8px', justifyContent: 'space-between' },
        onClick: () => navigate('/syarat-ketentuan'),
      }, 
        el('span', null, 'Syarat & Ketentuan'),
        icon('chevron-right', { size: 18 })
      ),
      el('button', {
        class: 'btn btn--ghost btn--block',
        type: 'button',
        style: { justifyContent: 'space-between' },
        onClick: () => navigate('/kebijakan-privasi'),
      },
        el('span', null, 'Kebijakan Privasi'),
        icon('chevron-right', { size: 18 })
      ),
    ));

    const dev = APP_INFO.developer;
    pageEl.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card__title' }, 'Developer'),
      rowWithAction('Nama', dev.name, null),
      rowWithAction('Peran', dev.role, null),
      rowWithAction('Email', dev.email, 'mailto:' + dev.email),
      rowWithAction('Telepon', dev.phone, 'tel:' + (dev.phone || '').replace(/\s/g, '')),
      rowWithAction('Website', dev.website, dev.website),
      rowWithAction('Lokasi', dev.city, null),
    ));

    const sup = APP_INFO.support || {};
    pageEl.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card__title' }, 'Dukungan'),
      el('button', {
        class: 'btn btn--block', type: 'button', style: { marginBottom: '8px' },
        onClick: () => {
          const wa = (sup.whatsapp || '').replace(/[^\d]/g, '');
          if (wa) window.open(`https://wa.me/${wa}`, '_blank');
          else toast('Nomor WhatsApp belum diatur', { type: 'warning' });
        },
      }, icon('pelanggan', { size: 18 }), 'Hubungi via WhatsApp'),
      el('button', {
        class: 'btn btn--block', type: 'button', style: { marginBottom: '8px' },
        onClick: () => {
          if (sup.email) window.location.href = 'mailto:' + sup.email;
          else toast('Email belum diatur', { type: 'warning' });
        },
      }, icon('receipt', { size: 18 }), 'Kirim Email'),
    ));

    pageEl.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card__title' }, 'Fitur Utama'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        ...(APP_INFO.features || []).map((f) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm)' } },
          icon('check', { size: 16 }), el('span', null, f)))
      ),
    ));

    pageEl.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card__title' }, 'Sistem'),
      el('button', { class: 'btn btn--block', type: 'button', style: { marginBottom: '8px' }, onClick: cekUpdate }, icon('sync', { size: 18 }), 'Cek Pembaruan Aplikasi'),
      el('button', { class: 'btn btn--block', type: 'button', style: { marginBottom: '8px' }, onClick: showSystemInfo }, icon('settings', { size: 18 }), 'Info Sistem'),
      el('button', { class: 'btn btn--danger btn--block', type: 'button', onClick: forceReload }, icon('warning', { size: 18 }), 'Muat Ulang Paksa'),
    ));

    pageEl.appendChild(el('div', { style: { textAlign: 'center', padding: '24px 16px 40px', color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)', lineHeight: '1.6' } },
      el('div', null, APP_INFO.copyright),
      el('div', null, `Dibuat dengan ❤ menggunakan HTML, JavaScript, dan CSS murni.`),
    ));

    function rowWithAction(label, value, href) {
      if (!value) return null;
      const inner = href ? el('a', { href, target: href.startsWith('http') ? '_blank' : undefined, style: { color: 'var(--color-primary)' } }, value) : el('strong', { style: { fontWeight: '500', textAlign: 'right' } }, value);
      return el('div', { class: 'card__row' }, el('span', null, label), inner);
    }

    async function cekUpdate() {
      try {
        if (!('serviceWorker' in navigator)) { toast('Service worker tidak didukung', { type: 'warning' }); return; }
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) { toast('Service worker belum terdaftar', { type: 'warning' }); return; }
        await reg.update();
        toastSuccess('Pembaruan dicek.');
      } catch (e) { toastError(e.message || 'Gagal cek pembaruan'); }
    }

    async function showSystemInfo() {
      const nav = navigator;
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const info = {
        'Versi Aplikasi': APP_INFO.version, 'Kode Perangkat': ctx.deviceCode || '-',
        'User Agent': nav.userAgent, 'Online': nav.onLine ? 'Ya' : 'Tidak',
        'Service Worker': reg ? 'Aktif' : 'Tidak aktif', 'URL': location.href,
      };
      const content = el('div');
      for (const [k, v] of Object.entries(info)) {
        content.appendChild(el('div', { class: 'detail-row' }, el('span', null, k), el('span', { style: { textAlign: 'right', fontSize: 'var(--fs-xs)', maxWidth: '60%' } }, String(v))));
      }
      openModal({ title: 'Info Sistem', content });
    }

    async function forceReload() {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {}
      sessionStorage.clear();
      location.reload();
    }
  },
};
export default page;