/**
 * src/ui/components/scanner-view.js
 * Komponen UI kamera scan. Logika BarcodeDetector dipasang di tahap 5
 * (hardware/barcode-camera.js). Tahap 3: placeholder + struktur dasar.
 */

import { el } from '../dom.js';

/**
 * @param {{ onResult?: (text:string) => void, onError?: (e:Error) => void }} [opts]
 */
export function createScannerView(opts = {}) {
  const video = /** @type {HTMLVideoElement} */ (el('video', { autoplay: true, muted: true, playsinline: true }));
  const root = el('div', { class: 'scanner-view' },
    video,
    el('div', { class: 'scanner-view__overlay' }, el('div', { class: 'scanner-view__frame' })),
  );

  let stream = null;
  let stopped = false;

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
    } catch (err) {
      console.error('[scanner] gagal buka kamera', err);
      if (opts.onError) opts.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    if (video.srcObject) {
      try { video.srcObject = null; } catch { /* noop */ }
    }
  }

  return { root, video, start, stop };
}