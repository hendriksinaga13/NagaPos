let _ac = null;
function getAudioContext() {
  if (_ac) return _ac;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try { _ac = new Ctor(); } catch { _ac = null; }
  return _ac;
}

export function beep({ freq = 1800, duration = 90, volume = 0.15, type = 'square' } = {}) {
  const ac = getAudioContext();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration / 1000);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(t0); osc.stop(t0 + duration / 1000 + 0.02);
}

export function vibrate(pattern = 60) {
  if ('vibrate' in navigator) { try { navigator.vibrate(pattern); } catch {} }
}

export function feedbackScanSuccess() { beep({ freq: 1800, duration: 70, volume: 0.2 }); vibrate(40); }
export function feedbackError() { beep({ freq: 400, duration: 220, volume: 0.2 }); vibrate([80, 50, 80]); }
export function feedbackPaySuccess() { beep({ freq: 1200, duration: 80, volume: 0.2 }); setTimeout(() => beep({ freq: 1800, duration: 120, volume: 0.2 }), 100); vibrate([40, 30, 60]); }

export function feedbackNewOrder() {
  beep({ freq: 880, duration: 300, volume: 0.3, type: 'sine' });
  setTimeout(() => beep({ freq: 660, duration: 400, volume: 0.3, type: 'sine' }), 350);
  vibrate([200, 100, 300]);
}

export function primeAudio() {
  const handler = () => { beep({ volume: 0.0001, duration: 10 }); document.removeEventListener('pointerdown', handler); document.removeEventListener('keydown', handler); };
  document.addEventListener('pointerdown', handler, { once: true });
  document.addEventListener('keydown', handler, { once: true });
}