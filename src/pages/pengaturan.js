/**
 * src/pages/pengaturan.js
 * Versi defensif — dijamin tidak crash.
 */

import { el } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { saveAppSettings } from '../models/settings.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { confirm } from '../ui/components/modal.js';
import { getCurrentUser, logout } from '../services/auth-service.js';
import { ROLE_LABEL } from '../models/user.js';
import { navigate } from '../router.js';

// Default fallback — dipakai kalau import opsional gagal
let EDITION_LABEL = { TRIAL: 'Trial', BASIC: 'Basic', PRO: 'Pro', ENT: 'Enterprise' };
let EDITION_COLOR = { TRIAL: 'warning', BASIC: 'primary', PRO: 'success', ENT: 'danger' };
let PRICE_LEVELS = ['retail', 'grosir', 'member'];
let formatDate = (ts) => {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '-'; }
};

async function loadOptionalImports() {
  try {
    const lic = await import('../models/license.js');
    if (lic.EDITION_LABEL) EDITION_LABEL = lic.EDITION_LABEL;
    if (lic.EDITION_COLOR) EDITION_COLOR = lic.EDITION_COLOR;
  } catch (e) { console.warn('[pengaturan] license.js error:', e.message); }
  try {
    const p = await import('../models/price.js');
    if (p.PRICE_LEVELS) PRICE_LEVELS = p.PRICE_LEVELS;
  } catch (e) { console.warn('[pengaturan] price.js error:', e.message); }
  try {
    const u = await import('../core/utils.js');
    if (u.formatDate) formatDate = u.formatDate;
  } catch (e) { console.warn('[pengaturan] utils.js error:', e.message); }
}

const page = {
  title: 'Pengaturan',
  layout: 'main',

  async mount(root, params, ctx) {
    try {
      ctx.setNavbarTitle?.('Pengaturan');
      ctx.setNavbarBack?.(true);

      await loadOptionalImports();

      const pageEl = el('div', { class: 'page' });
      root.appendChild(pageEl);

      let settings = { ...(ctx.settings || {}) };
      const currentUser = getCurrentUser();
      const license = ctx.license || {};
      const safeLicense = {
        edition: license.edition || 'TRIAL',
        expiry: license.expiry || 0,
        isLocked: !!license.isLocked,
        isTrial: license.isTrial !== false,
        daysLeft: Number(license.daysLeft) || 0,
      };

      /* ============ Helpers ============ */
      function field(label, inputNode, hint) {
        return el('div', { class: 'field' },
          el('label', { class: 'field__label' }, label),
          inputNode,
          hint ? el('div', { class: 'field__hint' }, hint) : null);
      }
      function sectionTitle(text) {
        return el('div', { class: 'form-section__title', style: { marginTop: '12px' } }, text);
      }
      function textInput(value, placeholder = '') {
        return el('input', { class: 'input', value: value || '', placeholder });
      }
      function numberInput(value, opts = {}) {
        return el('input', { class: 'input input--number', type: 'number', min: opts.min ?? '0', max: opts.max ?? undefined, step: opts.step ?? '1', value: String(value ?? 0) });
      }
      function textarea(value, rows = 2) {
        return el('textarea', { class: 'textarea', rows }, value || '');
      }
      function select(options, value) {
        const s = el('select', { class: 'select' }, ...options.map((o) => el('option', { value: o.value }, o.label)));
        s.value = value;
        return s;
      }

      /* ============ Form fields ============ */
      const nameInput = textInput(settings.storeName, 'Nama toko');
      const addressInput = textInput(settings.storeAddress, 'Alamat');
      const phoneInput = textInput(settings.storePhone, 'Telepon');
      const footerInput = textarea(settings.receiptFooter, 2);
      const widthSelect = select([
        { value: '58', label: '58 mm (32 karakter)' },
        { value: '80', label: '80 mm (48 karakter)' },
      ], settings.receiptWidth || '58');
      const themeSelect = select([
        { value: 'auto', label: 'Ikuti sistem' },
        { value: 'light', label: 'Terang' },
        { value: 'dark', label: 'Gelap' },
      ], settings.theme || 'auto');
      const taxToggle = el('input', { type: 'checkbox', style: { width: '22px', height: '22px' } });
      taxToggle.checked = !!settings.useTax;
      const taxInput = numberInput(settings.taxPercent || 0, { min: '0', max: '100', step: 'any' });
      const priceLevelSelect = select(
        PRICE_LEVELS.map((lv) => ({ value: lv, label: lv })),
        settings.defaultPriceLevel || 'retail',
      );

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--lg btn--block',
        type: 'button',
        style: { marginTop: '12px' },
        onClick: onSave,
      }, 'Simpan Pengaturan');

      async function onSave() {
        try {
          const patch = {
            storeName: nameInput.value.trim() || 'Toko Saya',
            storeAddress: addressInput.value.trim(),
            storePhone: phoneInput.value.trim(),
            receiptFooter: footerInput.value.trim(),
            receiptWidth: widthSelect.value,
            theme: themeSelect.value,
            useTax: taxToggle.checked,
            taxPercent: Math.max(0, Math.min(100, Number(taxInput.value) || 0)),
            defaultPriceLevel: priceLevelSelect.value || 'retail',
          };
          settings = await saveAppSettings(ctx.repos.settings, patch);
          await ctx.refreshSettings?.();
          ctx.applyTheme?.(settings.theme || 'auto');
          ctx.sync?.reload?.(ctx.settings);
          ctx.printer?.bindSettings?.(ctx.settings);
          toastSuccess('Pengaturan disimpan');
        } catch (e) {
          toastError(e.message || 'Gagal menyimpan');
        }
      }

      /* ============ Build UI ============ */
      pageEl.appendChild(el('div', { class: 'page__header' },
        el('h2', { class: 'page__title' }, 'Pengaturan'),
      ));

      // Card Akun
      if (currentUser) {
        pageEl.appendChild(el('div', { class: 'card', style: { marginBottom: '12px' } },
          el('div', { class: 'card__title' }, 'Akun Saya'),
          el('div', { class: 'card__row' }, el('span', null, 'Nama'), el('strong', null, currentUser.name)),
          el('div', { class: 'card__row' }, el('span', null, 'Username'), el('strong', null, '@' + currentUser.username)),
          el('div', { class: 'card__row' }, el('span', null, 'Role'), el('strong', null, ROLE_LABEL[currentUser.role] || currentUser.role)),
          el('button', {
            class: 'btn btn--danger btn--block',
            type: 'button',
            style: { marginTop: '12px' },
            onClick: async () => {
              const ok = await confirm({ title: 'Logout', message: 'Yakin ingin keluar?', confirmText: 'Logout', danger: true });
              if (!ok) return;
              logout();
              navigate('/login');
            },
          }, icon('close', { size: 18 }), 'Logout'),
        ));
      }

      // Card Lisensi
      const editionColor = EDITION_COLOR[safeLicense.edition] || 'info';
      const editionLabel = EDITION_LABEL[safeLicense.edition] || safeLicense.edition;
      const expiryStr = safeLicense.expiry ? formatDate(safeLicense.expiry) : '-';
      const statusLabel = safeLicense.isLocked ? 'Aktivasi Diperlukan'
        : safeLicense.isTrial ? `Trial (${safeLicense.daysLeft} hari)` : 'Aktif';

      pageEl.appendChild(el('div', {
        class: 'card',
        style: { marginBottom: '12px', cursor: 'pointer' },
        onClick: () => navigate('/lisensi'),
      },
        el('div', {
          class: 'card__title',
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        },
          el('span', null, 'Lisensi'),
          el('span', { class: `chip chip--${editionColor}` }, editionLabel),
        ),
        el('div', { class: 'card__row' },
          el('span', null, 'Status'),
          el('strong', { style: { color: safeLicense.isLocked ? 'var(--color-danger)' : 'var(--color-success)' } }, statusLabel),
        ),
        el('div', { class: 'card__row' },
          el('span', null, 'Berlaku s/d'),
          el('strong', null, expiryStr),
        ),
      ));

      // Sections
      pageEl.appendChild(sectionTitle('Toko'));
      pageEl.appendChild(field('Nama toko', nameInput));
      pageEl.appendChild(field('Alamat', addressInput));
      pageEl.appendChild(field('Telepon', phoneInput));

      pageEl.appendChild(sectionTitle('Struk'));
      pageEl.appendChild(field('Footer struk', footerInput, 'Tampil di bagian bawah struk.'));
      pageEl.appendChild(field('Lebar kertas', widthSelect));

      pageEl.appendChild(sectionTitle('Tampilan'));
      pageEl.appendChild(field('Tema', themeSelect));

      pageEl.appendChild(sectionTitle('Pajak & Harga'));
      pageEl.appendChild(el('div', { class: 'card__row', style: { padding: '6px 0' } },
        el('span', null, 'Aktifkan pajak'), taxToggle));
      pageEl.appendChild(field('Pajak (%)', taxInput));
      pageEl.appendChild(field('Level harga default', priceLevelSelect));

      pageEl.appendChild(saveBtn);

    } catch (fatalErr) {
      console.error('[pengaturan] FATAL:', fatalErr);
      root.innerHTML = '';
      const fallback = el('div', { class: 'page', style: { padding: '16px' } },
        el('h2', { style: { marginBottom: '8px' } }, 'Pengaturan'),
        el('div', { class: 'card', style: { borderColor: 'var(--color-danger)', borderWidth: '2px' } },
          el('div', { style: { fontWeight: '700', color: 'var(--color-danger)', marginBottom: '8px' } }, '⚠️ Halaman gagal dimuat'),
          el('pre', {
            style: { fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--color-surface-2)', padding: '8px', borderRadius: '6px' },
          }, (fatalErr && (fatalErr.stack || fatalErr.message)) || String(fatalErr)),
          el('button', {
            class: 'btn btn--primary btn--block',
            type: 'button',
            style: { marginTop: '12px' },
            onClick: () => location.reload(),
          }, 'Reload'),
        ),
      );
      root.appendChild(fallback);
    }
  },
};

export default page;