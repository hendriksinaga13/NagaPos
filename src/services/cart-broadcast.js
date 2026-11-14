const CHANNEL_NAME = 'kasir-display-sync';
let channel = null;
let customerWindow = null;

function getChannel() {
  if (!channel && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function broadcastCartState(state) {
  const ch = getChannel();
  if (!ch) return;
  try { ch.postMessage({ type: 'cart-update', state, at: Date.now() }); } catch {}
}

export function broadcastPaymentSuccess(payload) {
  const ch = getChannel();
  if (!ch) return;
  try { ch.postMessage({ type: 'payment-success', payload, at: Date.now() }); } catch {}
}

export function broadcastReset() {
  const ch = getChannel();
  if (!ch) return;
  try { ch.postMessage({ type: 'reset', at: Date.now() }); } catch {}
}

export function onCartMessage(cb) {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e) => { try { cb(e.data); } catch (err) { console.warn('[display]', err); } };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

export async function openCustomerDisplay() {
  const url = `${location.origin}${location.pathname}#/customer-display`;
  customerWindow = window.open(url, 'kasirCustomerDisplay', 'width=1024,height=768');
  if (!customerWindow) return { ok: false, reason: 'Popup diblokir.' };
  return { ok: true };
}

export function closeCustomerDisplay() {
  if (customerWindow && !customerWindow.closed) customerWindow.close();
  customerWindow = null;
}