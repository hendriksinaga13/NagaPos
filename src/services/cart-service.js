/**
 * src/services/cart-service.js
 * State keranjang + persist ke settings['cart.draft'].
 * 
 * BARU: dukungan serial/IMEI per line item.
 */

import { newId } from '../core/id.js';
import { debounce } from '../core/utils.js';
import { calcTotals } from '../models/sale.js';
import { resolveUnitPrice, computeLineSubtotal, lineCost } from './pricing-service.js';
import { matchLineDiscounts, matchSaleDiscounts, computeStackedDiscount } from './discount-service.js';

const DRAFT_KEY = 'cart.draft';
const HOLD_KEY = 'cart.held';

export class CartService {
  constructor(ctx) {
    this.ctx = ctx;
    this._listeners = new Set();
    this._raw = { items: [], customerId: null, manualDiscount: 0 };
    this._products = new Map();
    this._units = new Map();
    this._customer = null;
    this._discounts = [];
    this._computed = { lines: [], subtotal: 0, lineDiscountsTotal: 0, autoSaleDiscount: 0, manualDiscount: 0, totalDiscount: 0, total: 0, itemCount: 0 };
    this._persist = debounce(() => this._saveDraft(), 400);
  }

  static async create(ctx) {
    const svc = new CartService(ctx);
    await svc.refreshFromDb();
    await svc._restoreDraft();
    svc._recalculate();
    return svc;
  }

  subscribe(fn) { this._listeners.add(fn); fn(this.getState()); return () => this._listeners.delete(fn); }
  _emit() { const snap = this.getState(); for (const fn of this._listeners) { try { fn(snap); } catch (e) {} } }

  getState() {
    return {
      items: this._raw.items.map((x) => ({ ...x, serials: [...(x.serials || [])] })),
      customerId: this._raw.customerId,
      manualDiscount: this._raw.manualDiscount,
      computed: { ...this._computed, lines: this._computed.lines.map((l) => ({ ...l, serials: [...(l.serials || [])] })) },
    };
  }

  /**
   * Tambah produk ke keranjang.
   * @param {string} productId
   * @param {string} unitId
   * @param {number} [qty]
   * @param {string[]} [serials] Array serial untuk produk track-serial
   */
  async addProduct(productId, unitId, qty = 1, serials = []) {
    if (!productId || !unitId) throw new Error('productId & unitId wajib');
    await this._ensureProductUnit(productId, unitId);
    const product = this._products.get(productId);

    // Untuk produk track serial, wajib ada serial & qty = serials.length
    if (product.trackSerial) {
      if (!Array.isArray(serials) || serials.length === 0) {
        throw new Error('Produk ini butuh serial/IMEI');
      }
      const actualQty = serials.length;
      const existing = this._raw.items.find((i) => i.productId === productId && i.unitId === unitId);
      if (existing) {
        existing.serials = [...(existing.serials || []), ...serials];
        existing.qty = existing.serials.length;
      } else {
        this._raw.items.push({ lineId: newId(), productId, unitId, qty: actualQty, note: '', serials: [...serials] });
      }
      this._afterMutate();
      return;
    }

    // Produk biasa
    const q = Math.max(0, Number(qty) || 0);
    if (q <= 0) return;
    const existing = this._raw.items.find((i) => i.productId === productId && i.unitId === unitId);
    if (existing) existing.qty = Number((existing.qty + q).toFixed(4));
    else this._raw.items.push({ lineId: newId(), productId, unitId, qty: q, note: '', serials: [] });
    this._afterMutate();
  }

  setQty(lineId, qty) {
    const item = this._raw.items.find((i) => i.lineId === lineId);
    if (!item) return;
    // Untuk produk serial, tidak bisa ubah qty manual
    const product = this._products.get(item.productId);
    if (product?.trackSerial) return;
    const q = Math.max(0, Number(qty) || 0);
    if (q === 0) { this.removeItem(lineId); return; }
    item.qty = q; this._afterMutate();
  }

  /** Set serials untuk line tertentu. Qty otomatis disesuaikan. */
  setSerials(lineId, serials) {
    const item = this._raw.items.find((i) => i.lineId === lineId);
    if (!item) return;
    item.serials = Array.isArray(serials) ? [...serials] : [];
    item.qty = item.serials.length;
    if (item.qty === 0) { this.removeItem(lineId); return; }
    this._afterMutate();
  }

  incQty(lineId) {
    const item = this._raw.items.find((i) => i.lineId === lineId);
    if (!item) return;
    const product = this._products.get(item.productId);
    if (product?.trackSerial) return;
    this.setQty(lineId, item.qty + 1);
  }

  decQty(lineId) {
    const item = this._raw.items.find((i) => i.lineId === lineId);
    if (!item) return;
    const product = this._products.get(item.productId);
    if (product?.trackSerial) return;
    this.setQty(lineId, Math.max(0, item.qty - 1));
  }

  removeItem(lineId) { this._raw.items = this._raw.items.filter((i) => i.lineId !== lineId); this._afterMutate(); }

  async setCustomer(customerId) {
    this._raw.customerId = customerId || null;
    if (customerId) { this._customer = (await this.ctx.repos.customers.get(customerId)) || null; if (!this._customer) this._raw.customerId = null; }
    else this._customer = null;
    this._afterMutate();
  }

  setManualDiscount(amount) { this._raw.manualDiscount = Math.max(0, Math.round(Number(amount) || 0)); this._afterMutate(); }

  async clear() {
    this._raw = { items: [], customerId: null, manualDiscount: 0 };
    await this.ctx.repos.settings.remove(DRAFT_KEY);
    this._afterMutate();
  }

  /* ==================== HOLD ==================== */

  async holdOrder(name) {
    if (this._raw.items.length === 0) throw new Error('Keranjang kosong');
    const heldList = (await this.ctx.repos.settings.get(HOLD_KEY)) || [];
    heldList.push({ id: newId(), name: String(name || 'Tanpa Nama').trim(), at: Date.now(), data: JSON.parse(JSON.stringify(this._raw)) });
    await this.ctx.repos.settings.set(HOLD_KEY, heldList);
    await this.clear();
  }

  async getHeldOrders() { return (await this.ctx.repos.settings.get(HOLD_KEY)) || []; }

  async restoreHeldOrder(id) {
    const heldList = (await this.ctx.repos.settings.get(HOLD_KEY)) || [];
    const entry = heldList.find((h) => h.id === id);
    if (!entry) throw new Error('Pesanan tidak ditemukan');
    this._raw = entry.data;
    for (const it of this._raw.items) { await this._ensureProductUnit(it.productId, it.unitId, true); }
    await this.ctx.repos.settings.set(HOLD_KEY, heldList.filter((h) => h.id !== id));
    this._afterMutate();
  }

  async deleteHeldOrder(id) {
    const heldList = (await this.ctx.repos.settings.get(HOLD_KEY)) || [];
    await this.ctx.repos.settings.set(HOLD_KEY, heldList.filter((h) => h.id !== id));
  }

  /* ==================== DB ==================== */

  async refreshFromDb() {
    const { repos } = this.ctx;
    try { this._discounts = await repos.discounts.list(); } catch { this._discounts = []; }
    if (this._raw.customerId) {
      try { this._customer = (await repos.customers.get(this._raw.customerId)) || null; } catch { this._customer = null; }
      if (!this._customer) this._raw.customerId = null;
    } else this._customer = null;

    const valid = [];
    for (const it of this._raw.items) {
      try { await this._ensureProductUnit(it.productId, it.unitId, true); valid.push(it); } catch (e) {}
    }
    this._raw.items = valid;
    this._afterMutate();
  }

  toSaleDraft(payments = []) {
    const c = this._computed;
    const items = c.lines.map((l) => ({
      productId: l.productId,
      unitId: l.unitId,
      productName: l.productName,
      unitName: l.unitName,
      factor: l.factor,
      qty: l.qty,
      pricePerUnit: l.pricePerUnit,
      subtotal: l.subtotal,
      discountAmount: l.discountAmount,
      total: l.total,
      note: l.note,
      trackSerial: !!l.trackSerial,
      serials: [...(l.serials || [])],
    }));
    const sale = {
      id: '', number: '', status: 'paid', cashierId: '', shiftId: '',
      customerId: this._raw.customerId, items, payments,
      subtotal: c.subtotal, extraDiscount: c.autoSaleDiscount + c.manualDiscount,
      discountTotal: c.totalDiscount, taxTotal: 0, total: c.total,
      paidTotal: 0, change: 0, debtAmount: 0, note: '',
      createdAt: 0, updatedAt: 0, deleted: false,
    };
    calcTotals(sale);
    return sale;
  }

  async _ensureProductUnit(productId, unitId, force = false) {
    if (!force && this._products.has(productId) && this._units.has(unitId)) return;
    const [product, unit] = await Promise.all([this.ctx.repos.products.get(productId), this.ctx.repos.units.get(unitId)]);
    if (!product) throw new Error(`Produk ${productId} tidak ditemukan`);
    if (!unit) throw new Error(`Unit ${unitId} tidak ditemukan`);
    this._products.set(productId, product);
    this._units.set(unitId, unit);
  }

  _afterMutate() { this._recalculate(); this._persist(); this._emit(); }

  _recalculate() {
    const priceLevel = this._customer?.priceLevel || 'retail';
    const lines = []; let subtotal = 0, lineDiscountsTotal = 0, totalQty = 0;

    for (const item of this._raw.items) {
      const product = this._products.get(item.productId);
      const unit = this._units.get(item.unitId);
      if (!product || !unit) continue;
      const pricePerUnit = resolveUnitPrice(unit, priceLevel);
      const sub = computeLineSubtotal(unit, item.qty, priceLevel);
      const lineDiscCandidates = matchLineDiscounts(product, item.qty, sub, this._discounts);
      const lineDisc = computeStackedDiscount(lineDiscCandidates, sub);
      const lineTotal = sub - lineDisc.amount;
      lines.push({
        lineId: item.lineId, productId: product.id, unitId: unit.id,
        productName: product.name, unitName: unit.name, factor: unit.factor,
        qty: item.qty, pricePerUnit, subtotal: sub,
        discountAmount: lineDisc.amount, total: lineTotal,
        cost: lineCost(product, item.qty, unit.factor), note: item.note,
        appliedDiscountIds: lineDisc.appliedIds,
        trackSerial: !!product.trackSerial,
        serials: [...(item.serials || [])],
      });
      subtotal += sub; lineDiscountsTotal += lineDisc.amount; totalQty += item.qty;
    }

    const baseAfterLines = Math.max(0, subtotal - lineDiscountsTotal);
    const saleCandidates = [];
    if (this._customer && this._customer.discountPercent > 0) {
      saleCandidates.push({ id: '__customer_builtin__', name: `Diskon pelanggan`, scope: 'customer', targetId: this._customer.id, type: 'percent', value: this._customer.discountPercent, priority: 1000, minQty: 0, minSubtotal: 0, validFrom: null, validTo: null, active: true, stackable: true, createdAt: 0, updatedAt: 0, deleted: false });
    }
    saleCandidates.push(...matchSaleDiscounts(this._raw.customerId, baseAfterLines, totalQty, this._discounts));
    const autoSaleDisc = computeStackedDiscount(saleCandidates, baseAfterLines);
    const baseAfterAuto = Math.max(0, baseAfterLines - autoSaleDisc.amount);
    const manual = Math.min(baseAfterAuto, Math.max(0, Math.round(this._raw.manualDiscount || 0)));
    const extraDiscountTotal = autoSaleDisc.amount + manual;
    const totalDiscount = lineDiscountsTotal + extraDiscountTotal;
    const total = Math.max(0, subtotal - totalDiscount);

    this._computed = { lines, subtotal, lineDiscountsTotal, autoSaleDiscount: autoSaleDisc.amount, manualDiscount: manual, totalDiscount, total, itemCount: lines.length };
  }

  async _saveDraft() { try { await this.ctx.repos.settings.set(DRAFT_KEY, this._raw); } catch (e) {} }

  async _restoreDraft() {
    try {
      const data = await this.ctx.repos.settings.get(DRAFT_KEY);
      if (!data || !Array.isArray(data.items)) return;
      const valid = [];
      for (const it of data.items) {
        try { await this._ensureProductUnit(it.productId, it.unitId, true); valid.push(it); } catch (e) {}
      }
      this._raw = { items: valid, customerId: data.customerId || null, manualDiscount: data.manualDiscount || 0 };
    } catch (e) {}
  }
}

let _instance = null;
export async function getCartService(ctx) { if (!_instance) _instance = await CartService.create(ctx); return _instance; }
export function resetCartService() { _instance = null; }