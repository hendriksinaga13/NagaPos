export const SO_STATUS = Object.freeze({ PENDING: 'pending', PROCESSED: 'processed', CANCELLED: 'cancelled' });
export const SO_DEFAULTS = {
  id: '', number: '', customerId: null, customerName: '', items: [],
  total: 0, notes: '', status: 'pending', salesmanId: '', synced: false,
  createdAt: 0, updatedAt: 0, deleted: false,
};
export function createSalesOrder(input = {}) { return { ...SO_DEFAULTS, ...input }; }