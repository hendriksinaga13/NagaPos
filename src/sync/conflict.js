/**
 * src/sync/conflict.js
 * Aturan gabung: last-write-wins per record (via updatedAt).
 * Implementasi sesungguhnya ada di `dbfile.importSnapshot` mode 'merge'.
 * Wrapper ini memberi nama semantik + laporan hasil.
 */

import { importSnapshot } from '../core/dbfile.js';

/**
 * @param {import('../core/db.js').Database} db
 * @param {object} remoteSnapshot
 * @returns {Promise<{ imported: number, skipped: number }>}
 */
export async function mergeRemoteIntoLocal(db, remoteSnapshot) {
  if (!remoteSnapshot || remoteSnapshot.format !== 'kasir-dbfile') {
    throw new Error('Snapshot remote bukan format kasir-dbfile');
  }
  return importSnapshot(db, remoteSnapshot, { mode: 'merge' });
}