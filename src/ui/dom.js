/**
 * src/ui/dom.js
 * Helper DOM kecil: el, h, qs, qsa, clear, on, delegation.
 *
 * Aturan `el()`:
 *  - Atribut event handler ditulis camelCase (onClick, onInput, onKeyDown, …).
 *  - Nama event DOM WAJIB huruf kecil — onClick → click, onKeyDown → keydown.
 *  - Atribut boolean (disabled, hidden, checked, …) di-set via setAttribute.
 *  - dataset dan style (objek) digabung langsung.
 *  - `html` mengisi innerHTML. `true` → atribut kosong. null/false/undefined → diabaikan.
 */

/** @type {(tag: string, attrs?: object|null, ...children: (Node|string|false|null|undefined)[]) => HTMLElement} */
export function el(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;

      if (k === 'class' || k === 'className') {
        node.className = String(v);
      } else if (k === 'dataset') {
        Object.assign(node.dataset, v);
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(node.style, v);
      } else if (k.startsWith('on') && typeof v === 'function') {
        // FIX: WAJIB lowercase — 'onClick'.slice(2)='Click' → toLowerCase()='click'
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        node.innerHTML = String(v);
      } else if (v === true) {
        node.setAttribute(k, '');
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c === false || c == null) continue;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
}

/** Parse HTML string jadi satu elemen root (child pertama). */
export function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return /** @type {HTMLElement} */ (tpl.content.firstElementChild);
}

/** @param {string} sel @param {ParentNode} [root] */
export function qs(sel, root = document) {
  return /** @type {HTMLElement|null} */ (root.querySelector(sel));
}

/** @param {string} sel @param {ParentNode} [root] */
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/** @param {Element} node */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Event delegation.
 * @param {HTMLElement} root
 * @param {string} type nama event DOM huruf kecil (click, input, …)
 * @param {string} selector
 * @param {(e: Event, target: HTMLElement) => void} handler
 * @returns {() => void} unsubscribe
 */
export function delegate(root, type, selector, handler) {
  /** @param {Event} e */
  const fn = (e) => {
    const t = e.target instanceof Element ? e.target.closest(selector) : null;
    if (t && root.contains(t)) handler(e, /** @type {HTMLElement} */ (t));
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

/** @param {HTMLElement} node */
export function remove(node) {
  node.parentNode?.removeChild(node);
}