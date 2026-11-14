/**
 * src/pages/sinkron.js
 * Konfigurasi Supabase Storage, sinkron manual, dan backup/restore lokal.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toast, toastSuccess, toastError } from '../ui/components/toast.js';
import { saveAppSettings } from '../models/settings.js';
import { createBackup, restoreBackup } from '../services/backup-service.js';
import { getPending } from '../sync/sync-queue.js';

const page = {
  title: 'Sinkronisasi',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Sinkronisasi');
    ctx.setNavbarBack?.(true);

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    const syncManager = ctx.sync;
    if (!syncManager) {
      pageEl.appendChild(el('div', { class: 'empty' },
        el('div', { class: 'empty__title' }, 'Sync manager tidak tersedia'),
      ));
      return;
    }

    let settings = ctx.settings;

    /* ---------------- Header status ---------------- */

    const statusCard = el('div', { class: 'card' });
    pageEl.appendChild(el('div', { class: 'page__header' },
      el('h2', { class: 'page__title' }, 'Sinkronisasi'),
    ));
    pageEl.appendChild(statusCard);

    async function renderStatus(s) {
      clear(statusCard);
      const pending = await getPending(ctx.repos.settings);
      const stateLabel = s.syncing ? 'Menyinkronkan…'
        : s.state === 'error' ? 'Error'
        : s.enabled ? (s.online ? 'Siap' : 'Menunggu online')
        : 'Nonaktif';
      const chipClass = s.syncing ? 'chip chip--warning'
        : s.state === 'error' ? 'chip chip--danger'
        : s.enabled ? 'chip chip--success'
        : 'chip';

      statusCard.appendChild(el('div', { class: 'card__title' },
        'Status ',
        el('span', { class: chipClass, style: { marginLeft: '6px' } }, stateLabel),
      ));
      statusCard.appendChild(el('div', { class: 'card__row' },
        el('span', null, 'Jaringan'),
        el('strong', null, s.online ? 'Online' : 'Offline')));
      statusCard.appendChild(el('div', { class: 'card__row' },
        el('span', null, 'Sync terakhir'),
        el('strong', null, s.lastSyncAt ? formatDateTime(s.lastSyncAt) : '-')));
      statusCard.appendChild(el('div', { class: 'card__row' },
        el('span', null, 'Antrean'),
        el('strong', null, pending ? '1 perubahan menunggu' : 'Kosong')));

      if (s.lastError) {
        statusCard.appendChild(el('div', {
          class: 'card__row',
          style: { color: 'var(--color-danger)', fontSize: 'var(--fs-sm)' },
        }, s.lastError));
      }

      const actions = el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });

      if (s.enabled) {
        actions.appendChild(el('button', {
          class: 'btn btn--primary btn--block', type: 'button', disabled: s.syncing || !s.online,
          onClick: () => doSyncNow(),
        }, icon('sync', { size: 18 }), s.syncing ? 'Menyinkronkan…' : 'Sinkron Sekarang'));

        actions.appendChild(el('button', {
          class: 'btn btn--ghost btn--block', type: 'button', disabled: s.syncing,
          onClick: () => doTest(),
        }, icon('wifi', { size: 18 }), 'Tes Koneksi'));
      }

      statusCard.appendChild(actions);
    }

    async function doSyncNow() {
      try {
        const r = await syncManager.syncNow();
        if (r && r.busy) { toast('Sync sedang berjalan', { type: 'info' }); return; }
        toastSuccess(`Sync selesai. +${r?.imported || 0} record dari server`);
      } catch (e) {
        // PERBAIKAN: Gunakan e?.message
        toastError(e?.message || 'Sync gagal');
      }
    }

    async function doTest() {
      try {
        await syncManager.testConnection();
        toastSuccess('Koneksi OK. Bucket dapat diakses.');
      } catch (e) {
        toastError(e?.message || 'Tes koneksi gagal');
      }
    }

    /* ---------------- Konfigurasi ---------------- */

    const cfgCard = el('div', { class: 'card', style: { marginTop: '12px' } });
    pageEl.appendChild(cfgCard);

    function renderConfig() {
      clear(cfgCard);
      cfgCard.appendChild(el('div', { class: 'card__title' }, 'Konfigurasi Supabase'));

      const enabledToggle = el('input', { type: 'checkbox', style: { width: '22px', height: '22px' } });
      enabledToggle.checked = !!settings.syncEnabled;

      const urlInput = el('input', { class: 'input', type: 'url', placeholder: 'https://xxxx.supabase.co', value: settings.syncSupabaseUrl || '' });
      const keyInput = el('input', { class: 'input', placeholder: 'anon public key', value: settings.syncSupabaseAnonKey || '' });
      const bucketInput = el('input', { class: 'input', placeholder: 'kasir-db', value: settings.syncBucket || 'kasir-db' });
      const pathInput = el('input', { class: 'input', placeholder: `path file, contoh: tokosaya.db`, value: settings.syncPath || '' });
      const intervalInput = el('input', { class: 'input input--number', type: 'number', min: '15', step: '5', value: String(Math.round((settings.syncIntervalMs || 60000) / 1000)) });

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: async () => {
          const next = {
            syncEnabled: enabledToggle.checked,
            syncSupabaseUrl: urlInput.value.trim(),
            syncSupabaseAnonKey: keyInput.value.trim(),
            syncBucket: bucketInput.value.trim() || 'kasir-db',
            syncPath: pathInput.value.trim(),
            syncIntervalMs: Math.max(15000, (Number(intervalInput.value) || 60) * 1000),
          };
          try {
            settings = await saveAppSettings(ctx.repos.settings, next);
            await ctx.refreshSettings();
            syncManager.reload(ctx.settings);
            toastSuccess('Konfigurasi disimpan');
          } catch (e) {
            toastError(e?.message || 'Gagal menyimpan');
          }
        },
      }, 'Simpan Konfigurasi');

      cfgCard.appendChild(el('div', { class: 'card__row', style: { padding: '4px 0' } }, el('span', null, 'Aktifkan auto-sync'), enabledToggle));
      cfgCard.appendChild(field('URL proyek Supabase', urlInput));
      cfgCard.appendChild(field('Anon key', keyInput));
      cfgCard.appendChild(el('div', { class: 'grid grid--2' }, field('Bucket', bucketInput), field('Interval (detik)', intervalInput)));
      cfgCard.appendChild(field('Path snapshot', pathInput));
      cfgCard.appendChild(el('div', { class: 'field__hint', style: { marginBottom: '12px' } }, 'Bucket harus dibuat manual di dashboard Supabase dan diset PRIVATE.'));
      cfgCard.appendChild(saveBtn);
    }

    /* ---------------- Backup / Restore ---------------- */

    const backupCard = el('div', { class: 'card', style: { marginTop: '12px' } });
    pageEl.appendChild(backupCard);

    function renderBackup() {
      clear(backupCard);
      backupCard.appendChild(el('div', { class: 'card__title' }, 'Backup Lokal'));

      backupCard.appendChild(el('button', {
        class: 'btn btn--block', type: 'button', style: { marginBottom: '8px' },
        onClick: async () => {
          try { await createBackup(ctx); toastSuccess('Backup dibuat'); }
          catch (e) { toastError(e?.message || 'Gagal backup'); }
        },
      }, icon('receipt', { size: 18 }), 'Unduh Backup (.db)'));

      const fileInput = el('input', {
        type: 'file', accept: '.db,.json,application/json', style: { display: 'none' },
        onChange: async (e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = '';
          if (!file) return;
          const mode = await confirm({ title: 'Mode Restore', message: 'OK = merge (aman), Batal = ganti seluruh data.', confirmText: 'Merge', cancelText: 'Ganti Semua', danger: false }) ? 'merge' : 'replace';
          try {
            const r = await restoreBackup(ctx, file, mode);
            toastSuccess(`Restore selesai. +${r.imported} record`);
            await ctx.refreshSettings();
            if (ctx.cart) await ctx.cart.refreshFromDb().catch(() => {});
          } catch (err) { toastError(err?.message || 'Gagal restore'); }
        },
      });

      backupCard.appendChild(el('button', {
        class: 'btn btn--ghost btn--block', type: 'button',
        onClick: () => fileInput.click(),
      }, icon('sync', { size: 18 }), 'Restore dari File'));
      backupCard.appendChild(fileInput);
    }

    function field(label, input) {
      return el('div', { class: 'field' }, el('label', { class: 'field__label' }, label), input);
    }

    /* ---------------- Init ---------------- */

    const unsub = syncManager.subscribe((s) => { renderStatus(s); });
    renderConfig();
    renderBackup();

    page.unmount = () => { unsub(); };
  },
};

export default page;