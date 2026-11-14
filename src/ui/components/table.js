/**
 * src/ui/components/table.js
 * Render tabel dari array baris. Kolom adalah objek
 *   { key, label, align?: 'left'|'right', render?: (row) => Node|string }
 */

import { el } from '../dom.js';

/**
 * @typedef {{ key: string, label: string, align?: 'left'|'right', render?: (row: any) => (Node|string) }} Column
 */

/**
 * @param {Column[]} columns
 * @param {any[]} rows
 * @param {{ empty?: string, onRowClick?: (row:any) => void }} [opts]
 */
export function createTable(columns, rows, opts = {}) {
  const { empty = 'Belum ada data', onRowClick } = opts;

  if (!rows.length) {
    return el('div', { class: 'empty' },
      el('div', { class: 'empty__title' }, empty),
    );
  }

  const thead = el('thead', null,
    el('tr', null, ...columns.map((c) =>
      el('th', { class: c.align === 'right' ? 'num' : '' }, c.label),
    )),
  );

  const tbody = el('tbody', null, ...rows.map((row) => {
    const tr = el('tr', null, ...columns.map((c) => {
      const content = c.render ? c.render(row) : (row[c.key] ?? '');
      return el('td', { class: c.align === 'right' ? 'num' : '' },
        content instanceof Node ? content : String(content));
    }));
    if (onRowClick) tr.addEventListener('click', () => onRowClick(row));
    return tr;
  }));

  const table = el('table', { class: 'table table--num' }, thead, tbody);
  return el('div', { class: 'table-wrap' }, table);
}