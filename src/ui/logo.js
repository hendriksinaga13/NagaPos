/**
 * src/ui/logo.js
 * Helper logo. SVG statis untuk performa.
 */

export const LOGO_MARK = 'assets/logo/logo-mark.svg';
export const LOGO_FULL = 'assets/logo/logo.svg';
export const LOGO_MONO = 'assets/logo/logo-mono.svg';

/**
 * @param {'mark'|'full'|'mono'} variant
 * @param {{ size?: number, className?: string, alt?: string }} [opts]
 */
export function logo(variant = 'mark', { size = 32, className = '', alt = 'Kasir' } = {}) {
  const src = variant === 'full' ? LOGO_FULL : variant === 'mono' ? LOGO_MONO : LOGO_MARK;
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.width = size;
  img.height = size;
  if (className) img.className = className;
  return img;
}