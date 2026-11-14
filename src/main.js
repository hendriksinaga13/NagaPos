/**
 * src/main.js
 * Entry point aplikasi. Urutan boot:
 *   1. Buka IndexedDB (migrasi otomatis di onupgradeneeded).
 *   2. Pastikan device.code tersedia (dipakai nomor nota).
 *   3. Daftarkan Service Worker + tangani update.
 *   4. Pantau status online/offline → diteruskan ke app.
 *   5. Serahkan kendali ke app.js.
 *
 * Bila gagal pada tahap mana pun, tampilkan pesan ramah di boot screen.
 * Tidak ada variabel global; semua state lokal di dalam boot().
 */

import { getDb } from './core/db.js';
import { getDeviceCode } from './core/id.js';
import { getRepos } from './core/repository.js';
import { startApp } from './app.js';

/* ===================== Utilitas boot ===================== */

/** Update teks indikator di boot screen, jika masih ada. */
function setBootStatus(text) {
  const el = document.querySelector('.boot-version');
  if (el) el.textContent = text;
}

/** Tampilkan layar error ramah (di dalam #app). */
function showFatalError(err) {
  const app = document.getElementById('app');
  if (!app) return;
  const msg = err instanceof Error ? err.message : String(err);
  app.innerHTML = `
    <div class="boot-screen" role="alert">
      <img src="assets/logo/logo-mark.svg" alt="" width="72" height="72" />
      <h1>Gagal menyiapkan aplikasi</h1>
      <p>${msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>
      <p class="boot-version">Coba muat ulang. Jika tetap gagal, hapus data situs lalu buka lagi.</p>
      <button class="btn btn--primary" onclick="location.reload()">Muat Ulang</button>
    </div>
  `;
}

/* ===================== Service Worker ===================== */

/**
 * Daftarkan Service Worker dan pasang handler update.
 * Memakai reload sekali saat SW baru mengambil alih, agar tab tidak stuck
 * di versi lama. Hindari reload berulang dengan flag sessionStorage.
 */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[kasir] service worker tidak didukung');
    return null;
  }
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    console.warn('[kasir] service worker butuh HTTPS/localhost — dilewati');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    console.log('[kasir] service worker terdaftar:', reg.scope);

    // Cek update saat tab kembali aktif (Chrome Android sering mematikan SW).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
      }
    });

    // Bila SW baru mengambil kendali, muat ulang sekali agar modul terbaru dipakai.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('kasir.sw-reloaded') === '1') return;
      sessionStorage.setItem('kasir.sw-reloaded', '1');
      console.log('[kasir] SW baru aktif, memuat ulang');
      location.reload();
    });

    return reg;
  } catch (err) {
    console.warn('[kasir] service worker gagal didaftarkan', err);
    return null;
  }
}

/* ===================== Indikator jaringan ===================== */

/**
 * Pantau online/offline. Callback dipanggil dengan status saat ini
 * dan setiap kali berubah. Mengembalikan fungsi unsubscribe.
 * @param {(online: boolean) => void} cb
 * @returns {() => void}
 */
function watchConnectivity(cb) {
  const notify = () => cb(navigator.onLine !== false);
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  notify();
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

/* ===================== Boot utama ===================== */

async function boot() {
  try {
    setBootStatus('Membuka database…');
    const db = getDb();
    await db.open();
    console.log('%c[kasir] DB siap', 'color:#16a34a');

    setBootStatus('Menyiapkan perangkat…');
    const deviceCode = await getDeviceCode(db);
    console.log('[kasir] device.code =', deviceCode);

    setBootStatus('Mendaftarkan service worker…');
    await registerServiceWorker();

    setBootStatus('Menyiapkan antarmuka…');

    const repos = getRepos();
    const connectivity = watchConnectivity((online) => {
      // Teruskan event ke app jika sudah siap (setelah startApp selesai).
      if (typeof window.__kasirOnConnectivity === 'function') {
        window.__kasirOnConnectivity(online);
      }
    });

    await startApp({ db, deviceCode, repos });

    // Ekspos hook untuk listener connectivity setelah app berjalan.
    // Ini satu-satunya properti di window yang kita pakai; dibersihkan pada unload.
    window.addEventListener('beforeunload', () => connectivity(), { once: true });

    console.log('%c[kasir] aplikasi siap', 'color:#16a34a;font-weight:bold');
  } catch (err) {
    console.error('[kasir] inisialisasi gagal', err);
    showFatalError(err);
  }
}

// Jalankan.
boot();