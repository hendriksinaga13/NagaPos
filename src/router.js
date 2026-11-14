/**
 * src/router.js
 * Router hash-based dengan dukungan query string.
 *   registerRoute('/kasir', () => import('./pages/kasir.js'))
 *   navigate('/satuan?productId=abc')
 *   startRouter(outlet, ctx)
 *
 * Modul halaman default export:
 *   { title, layout?: 'main'|'plain', flush?: boolean,
 *     mount(root, params, ctx), unmount?() }
 *
 * params = { path: string, query: URLSearchParams }
 */

/** @type {Map<string, () => Promise<any>>} */
const ROUTES = new Map();
/** @type {HTMLElement|null} */ let outlet = null;
/** @type {any} */ let ctx = {};
/** @type {{unmount?: () => void}|null} */ let current = null;
/** @type {Set<(path:string) => void>} */ const listeners = new Set();

export function registerRoute(path, loader) {
  ROUTES.set(path, loader);
}

export function navigate(path) {
  if (location.hash === `#${path}`) return;
  location.hash = `#${path}`;
}

export function currentPath() {
  return location.hash.replace(/^#/, '') || '/kasir';
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {HTMLElement} el
 * @param {any} context
 */
export async function startRouter(el, context) {
  outlet = el;
  ctx = context;
  window.addEventListener('hashchange', () => render());
  await render();
}

/** @param {string} rawPath @returns {{ pathname:string, query:URLSearchParams }} */
function parsePath(rawPath) {
  const [pathname, qs] = rawPath.split('?');
  return { pathname, query: new URLSearchParams(qs || '') };
}

async function render() {
  if (!outlet) return;
  const rawPath = currentPath();
  const { pathname, query } = parsePath(rawPath);

  const loader = ROUTES.get(pathname);
  if (!loader) {
    console.warn('[router] route tidak dikenal', pathname);
    if (pathname !== '/kasir') navigate('/kasir');
    return;
  }

  if (current && current.unmount) {
    try { current.unmount(); } catch (e) { console.warn('[router] unmount gagal', e); }
  }
  current = null;

  while (outlet.firstChild) outlet.removeChild(outlet.firstChild);

  const wrap = document.createElement('div');
  wrap.className = 'page';
  outlet.appendChild(wrap);

  try {
    const mod = await loader();
    const page = mod.default || mod;
    current = page;

    document.title = (page.title || 'Kasir') + ' • Kasir';

    if (page.layout === 'plain') {
      document.body.classList.add('no-navbar', 'no-bottomnav');
    } else {
      document.body.classList.remove('no-navbar', 'no-bottomnav');
    }
    if (page.flush) wrap.classList.add('page--flush');

    await page.mount(wrap, { path: pathname, query }, ctx);

    for (const fn of listeners) fn(pathname);
  } catch (err) {
    console.error('[router] gagal render', pathname, err);
    wrap.innerHTML = '';
    const errBox = document.createElement('div');
    errBox.className = 'page-error';
    errBox.innerHTML = `<h2>Gagal memuat halaman</h2><pre>${String(err && err.stack || err)}</pre>`;
    wrap.appendChild(errBox);
  }
}