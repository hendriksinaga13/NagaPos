export const SETTINGS_KEY = 'app.settings';

export const SETTINGS_DEFAULTS = Object.freeze({
  storeName: 'Toko Saya',
  storeAddress: '',
  storePhone: '',
  receiptFooter: 'Terima kasih telah berbelanja',
  receiptWidth: '58',
  logoMonoDataUrl: '',
  useTax: false,
  taxPercent: 0,
  roundingMode: 'none',
  defaultPriceLevel: 'retail',
  printerDeviceId: '',
  printerDeviceName: '',
  printerAutoConnect: false,
  theme: 'auto',
  syncSupabaseUrl: '',
  syncSupabaseAnonKey: '',
  syncBucket: 'kasir-db',
  syncPath: 'snapshot.db',
  syncEnabled: false,
  syncIntervalMs: 60000,
  appRole: '',
  cashierPin: '',
  salesmanPin: '',
  storeCode: '',
  selfOrderEnabled: false,
  selfOrderTableCount: 10,
  // ===== LICENSE =====
  licenseKey: '',
  licenseActivatedAt: 0,
});

export function createSettings(input = {}) {
  return { ...SETTINGS_DEFAULTS, ...input };
}

export async function loadAppSettings(settingsRepo) {
  const stored = await settingsRepo.get(SETTINGS_KEY);
  return createSettings(stored || {});
}

export async function saveAppSettings(settingsRepo, patch) {
  const current = await loadAppSettings(settingsRepo);
  const next = { ...current, ...patch };
  await settingsRepo.set(SETTINGS_KEY, next);
  return next;
}