/**
 * src/ui/icon.js
 * Helper memakai sprite SVG di assets/icons/sprite.svg.
 */

const SPRITE = 'assets/icons/sprite.svg';

/**
 * Buat elemen <svg><use></svg>.
 * @param {string} name nama ikon tanpa prefix "i-" (mis. 'kasir', 'scan').
 * @param {{ size?: number, className?: string, stroke?: number }} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, { size = 24, className = '' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `${SPRITE}#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/** Versi string — untuk template HTML. */
export function iconHtml(name, { size = 24, className = '' } = {}) {
  return `<svg class="icon ${className}" width="${size}" height="${size}" aria-hidden="true"><use href="${SPRITE}#i-${name}"></use></svg>`;
}