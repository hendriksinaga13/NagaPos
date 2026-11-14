/**
 * src/pages/audit-log.js
 * Audit log menampilkan nama user (bukan device code).
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatDateTime, formatDate } from '../core/utils.js';
import { openModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { listAuditLogs, purgeOldLogs } from '../services/audit-service.js';
import { AUDIT_ACTIONS, ACTION_LABEL, ACTION_COLOR } from '../models/audit-log.js';

const page = {
  title: 'Audit Log',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Audit Log');
    ctx.setNavbarBack?.(true);

    let activeTab = 'today';
    let filterAction = '';
    let searchQuery = '';
    let logs = [];
    /** @type {Map<string, string>} */
    let userNameCache = new Map();

    // Pre-fetch semua user untuk lookup nama
    try {
      const users = await ctx.repos.users.listAll();
      for (const u of users) {
        userNameCache.set(u.username, u.name);
        userNameCache.set(u.id, u.name);
      }
    } catch {}

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const listEl = el('div', { class: 'kasir-list' });
    pageEl.append(tabs, toolbar, listEl);
    root.appendChild(pageEl);

    const search = createSearchBox({
      placeholder: 'Cari nama, keterangan…',
      onInput: (v) => { searchQuery = String(v || '').toLowerCase(); render(); },
    });
    const actionSelect = el('select', { class: 'select' });
    actionSelect.style.marginTop = '8px';
    actionSelect.addEventListener('change', () => { filterAction = actionSelect.value; render(); });
    actionSelect.appendChild(el('option', { value: '' }, 'Semua Aksi'));
    for (const [key, label] of Object.entries(ACTION_LABEL)) {
      actionSelect.appendChild(el('option', { value: key }, label));
    }
    toolbar.append(el('div', { class: 'kasir-toolbar__row' }, search.root), actionSelect);

    function renderTabs() {
      clear(tabs);
      const items = [
        { id: 'today', label: 'Hari Ini' },
        { id: 'week', label: '7 Hari' },
        { id: 'month', label: '30 Hari' },
        { id: 'all', label: 'Semua' },
      ];
      for (const it of items) {
        tabs.appendChild(el('button', {
          class: 'page-tab', type: 'button',
          'aria-selected': String(activeTab === it.id),
          onClick: () => { activeTab = it.id; renderTabs(); reload(); },
        }, it.label));
      }
    }

    function getPeriod() {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      switch (activeTab) {
        case 'today': return { from: startOfToday, to: Date.now() + 1 };
        case 'week': return { from: Date.now() - 7 * 24 * 3600 * 1000, to: Date.now() + 1 };
        case 'month': return { from: Date.now() - 30 * 24 * 3600 * 1000, to: Date.now() + 1 };
        case 'all': return {};
        default: return { from: startOfToday, to: Date.now() + 1 };
      }
    }

    async function reload() {
      try {
        const period = getPeriod();
        logs = await listAuditLogs(ctx, { ...period, action: filterAction, limit: 500 });
        render();
      } catch (e) { toastError(e.message || 'Gagal memuat'); }
    }

    function userNameOf(userId) {
      if (!userId) return '-';
      return userNameCache.get(userId) || userId;
    }

    function render() {
      clear(listEl);
      let filtered = logs;
      if (searchQuery) {
        filtered = logs.filter((l) => {
          const s = JSON.stringify(l.details || {}).toLowerCase();
          const a = (ACTION_LABEL[l.action] || l.action).toLowerCase();
          return s.includes(searchQuery) || a.includes(searchQuery) || (l.userId || '').toLowerCase().includes(searchQuery);
        });
      }

      const stats = {};
      for (const l of filtered) stats[l.action] = (stats[l.action] || 0) + 1;
      const statEntries = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 4);

      if (filtered.length === 0) {
        listEl.appendChild(el('div', { class: 'empty' },
          icon('receipt', { size: 48 }),
          el('div', { class: 'empty__title' }, 'Belum ada aktivitas'),
        ));
        return;
      }

      if (statEntries.length > 0) {
        listEl.appendChild(el('div', {
          style: { padding: '8px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: 'var(--fs-xs)' },
        },
          ...statEntries.map(([action, count]) =>
            el('span', { class: `chip chip--${ACTION_COLOR[action] || ''}` }, `${ACTION_LABEL[action] || action}: ${count}`)),
        ));
      }

      let currentDate = '';
      for (const log of filtered) {
        const dateStr = formatDate(log.at);
        if (dateStr !== currentDate) {
          currentDate = dateStr;
          listEl.appendChild(el('div', {
            style: { padding: '8px 4px 4px', fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
          }, dateStr));
        }
        listEl.appendChild(renderLogItem(log));
      }
    }

    function renderLogItem(log) {
      const color = ACTION_COLOR[log.action] || 'info';
      const label = ACTION_LABEL[log.action] || log.action;
      const summary = summarize(log);
      const userName = userNameOf(log.userId);
      return el('div', { class: 'list-item', onClick: () => openDetail(log) },
        el('div', { style: { width: '8px', height: '40px', borderRadius: 'var(--radius-sm)', background: `var(--color-${color === 'info' ? 'primary' : color})`, flexShrink: 0 } }),
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' }, label),
          el('div', { class: 'list-item__meta' }, summary),
          el('div', { class: 'list-item__meta' }, `${formatDateTime(log.at)} • ${userName}`),
        ),
        el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
      );
    }

    function summarize(log) {
      const d = log.details || {};
      const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
      switch (log.action) {
        case AUDIT_ACTIONS.SALE_CREATE: return `${d.number || '-'} • Rp ${fmt(d.total)} • ${d.itemCount || 0} item`;
        case AUDIT_ACTIONS.SALE_VOID: return `${d.number || '-'}${d.reason ? ' • ' + d.reason : ''}`;
        case AUDIT_ACTIONS.SALE_RETURN: return `${d.number || '-'} • refund Rp ${fmt(d.refundAmount || 0)}`;
        case AUDIT_ACTIONS.DEBT_PAYMENT: return `${d.customerName || '-'} • Rp ${fmt(d.amount || 0)}`;
        case AUDIT_ACTIONS.SHIFT_OPEN: return `Kas awal Rp ${fmt(d.openingCash || 0)}`;
        case AUDIT_ACTIONS.SHIFT_CLOSE: return `Selisih Rp ${fmt(d.difference || 0)}`;
        case AUDIT_ACTIONS.STOCK_IN:
        case AUDIT_ACTIONS.STOCK_OUT:
        case AUDIT_ACTIONS.STOCK_ADJUST: return `${d.productName || '-'} • ${d.qty} ${d.unitName || ''}`;
        case AUDIT_ACTIONS.PRODUCT_CREATE:
        case AUDIT_ACTIONS.PRODUCT_UPDATE:
        case AUDIT_ACTIONS.PRODUCT_DELETE: return d.productName || '-';
        case AUDIT_ACTIONS.CUSTOMER_CREATE:
        case AUDIT_ACTIONS.CUSTOMER_DELETE: return d.customerName || '-';
        default: return d.summary || '-';
      }
    }

    function openDetail(log) {
      const rows = el('div');
      rows.appendChild(el('div', { class: 'detail-row' }, el('span', null, 'Waktu'), el('strong', null, formatDateTime(log.at))));
      rows.appendChild(el('div', { class: 'detail-row' }, el('span', null, 'Aksi'), el('strong', null, ACTION_LABEL[log.action] || log.action)));
      rows.appendChild(el('div', { class: 'detail-row' }, el('span', null, 'User'), el('strong', null, userNameOf(log.userId))));
      const details = log.details || {};
      if (Object.keys(details).length > 0) {
        rows.appendChild(el('div', { class: 'form-section__title', style: { marginTop: '16px' } }, 'Detail'));
        for (const [k, v] of Object.entries(details)) {
          const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '');
          rows.appendChild(el('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--color-border)' } },
            el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } }, k),
            el('div', { style: { fontSize: 'var(--fs-sm)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' } }, val),
          ));
        }
      }
      openModal({ title: ACTION_LABEL[log.action] || 'Detail Log', content: rows });
    }

    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Bersihkan log lama',
      style: { background: 'var(--color-danger)' },
      onClick: async () => {
        const ok = await confirm({ title: 'Bersihkan Log Lama', message: 'Hapus semua log lebih dari 90 hari?', confirmText: 'Bersihkan', danger: true });
        if (!ok) return;
        try { const n = await purgeOldLogs(ctx, 90); toastSuccess(`${n} log lama dihapus`); await reload(); }
        catch (e) { toastError(e.message || 'Gagal bersihkan log'); }
      },
    }, icon('trash', { size: 22 }));
    pageEl.appendChild(fab);

    renderTabs();
    await reload();
  },
};

export default page;