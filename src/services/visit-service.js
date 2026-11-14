/**
 * src/services/visit-service.js
 * Tracking kunjungan salesman per hari + status selesai tugas.
 */

const VISIT_KEY = 'salesman.visit.today';
const FINISHED_KEY = 'salesman.finished.today';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @returns {object|null} */
export function getVisitState() {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.date !== todayKey()) return null; // hari sudah ganti → reset otomatis
    return state;
  } catch {
    return null;
  }
}

/** Mulai hari baru. */
export function startDay() {
  const state = {
    date: todayKey(),
    startedAt: Date.now(),
    endedAt: 0,
    visits: {},
  };
  localStorage.setItem(VISIT_KEY, JSON.stringify(state));
  return state;
}

/** Akhiri hari. */
export function endDay() {
  const state = getVisitState();
  if (!state) return;
  state.endedAt = Date.now();
  localStorage.setItem(VISIT_KEY, JSON.stringify(state));
}

/* ============ FLAG SELESAI TUGAS ============ */

/** Tandai tugas hari ini sudah selesai (kunci sampai besok). */
export function markDayFinished() {
  localStorage.setItem(FINISHED_KEY, todayKey());
}

/** Cek apakah tugas hari ini sudah selesai. */
export function isDayFinished() {
  return localStorage.getItem(FINISHED_KEY) === todayKey();
}

/** Reset status selesai (untuk keperluan testing). */
export function clearDayFinished() {
  localStorage.removeItem(FINISHED_KEY);
}

/* ============ KUNJUNGAN ============ */

export function startVisit(customerId) {
  const state = getVisitState();
  if (!state) throw new Error('Hari belum dimulai');
  state.visits[customerId] = {
    status: 'in_progress',
    startedAt: Date.now(),
    finishedAt: 0,
    soId: '',
    soNumber: '',
    reason: '',
  };
  localStorage.setItem(VISIT_KEY, JSON.stringify(state));
}

export function finishVisit(customerId, { soId = '', soNumber = '' } = {}) {
  const state = getVisitState();
  if (!state) return;
  state.visits[customerId] = {
    ...(state.visits[customerId] || { startedAt: Date.now() }),
    status: 'done',
    finishedAt: Date.now(),
    soId,
    soNumber,
  };
  localStorage.setItem(VISIT_KEY, JSON.stringify(state));
}

export function skipVisit(customerId, reason = 'Tidak ada order') {
  const state = getVisitState();
  if (!state) return;
  state.visits[customerId] = {
    ...(state.visits[customerId] || { startedAt: Date.now() }),
    status: 'done',
    finishedAt: Date.now(),
    soId: '',
    soNumber: '',
    reason,
  };
  localStorage.setItem(VISIT_KEY, JSON.stringify(state));
}

export function getVisitStatus(customerId) {
  const state = getVisitState();
  if (!state) return null;
  return state.visits[customerId] || null;
}

export function getVisitSummary(customers) {
  const state = getVisitState();
  const total = customers.length;
  if (!state) return { started: false, total, pending: total, in_progress: 0, done: 0 };

  let done = 0;
  let in_progress = 0;
  for (const c of customers) {
    const v = state.visits[c.id];
    if (v?.status === 'done') done++;
    else if (v?.status === 'in_progress') in_progress++;
  }
  return {
    started: true,
    startedAt: state.startedAt,
    endedAt: state.endedAt || 0,
    total,
    pending: total - done - in_progress,
    in_progress,
    done,
  };
}

export function clearDay() {
  localStorage.removeItem(VISIT_KEY);
}