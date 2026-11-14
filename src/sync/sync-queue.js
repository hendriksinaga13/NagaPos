/**
 * src/sync/sync-queue.js
 * Penanda "ada perubahan yang belum terunggah" disimpan di settings.
 * Bukan antrean operasi detail — karena push snapshot bersifat idempoten,
 * cukup flag + timestamp.
 */

const KEY = 'sync.pending';

/** @param {import('../core/repository.js').SettingsRepository} settingsRepo */
export async function markPending(settingsRepo) {
  try {
    await settingsRepo.set(KEY, { at: Date.now() });
  } catch (e) {
    console.warn('[sync-queue] gagal markPending', e);
  }
}

/** @param {import('../core/repository.js').SettingsRepository} settingsRepo */
export async function clearPending(settingsRepo) {
  try { await settingsRepo.remove(KEY); } catch { /* noop */ }
}

/** @param {import('../core/repository.js').SettingsRepository} settingsRepo */
export async function getPending(settingsRepo) {
  try { return await settingsRepo.get(KEY) || null; } catch { return null; }
}