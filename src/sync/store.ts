import { openDB, type DBSchema } from 'idb';
import {
  DEFAULT_LOAN_POLICY,
  grantLoans,
  loanUsage,
  revokeDevice,
  revokeLoan,
  summarizeDevices,
  validatePolicy,
  type DeviceSummary,
  type GrantResult,
  type LoanPolicy,
  type LoanRecord,
  type LoanRequest,
} from './loan';
import type { Platform } from './protocol';

/**
 * Sync persistence lives in its own database so the music library schema and
 * its migration path stay untouched. Borrowed audio is always paired with its
 * loan record in the same transaction: a record without bytes is never playable,
 * and bytes without a record are never orphaned.
 */
export interface SyncDevice {
  deviceId: string;
  name: string;
  platform: Platform;
  pairedAt: number;
  lastSeenAt: number;
}

/**
 * Audio is stored as verified bytes rather than a Blob: the transfer already
 * produced a checked byte array, and ArrayBuffer cloning is reliable in every
 * IndexedDB implementation. A Blob is rebuilt on read for playback.
 */
export interface StoredAudio {
  loanId: string;
  bytes: ArrayBuffer;
  type: string;
}

interface WaveSyncDatabase extends DBSchema {
  devices: { key: string; value: SyncDevice };
  loans: { key: string; value: LoanRecord };
  audio: { key: string; value: StoredAudio };
}

const DATABASE_NAME = 'wave-sync';

export function openSyncStore() {
  return openDB<WaveSyncDatabase>(DATABASE_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('devices'))
        db.createObjectStore('devices', { keyPath: 'deviceId' });
      if (!db.objectStoreNames.contains('loans'))
        db.createObjectStore('loans', { keyPath: 'loanId' });
      if (!db.objectStoreNames.contains('audio'))
        db.createObjectStore('audio', { keyPath: 'loanId' });
    },
    blocking(_old, _next, event) {
      (event.target as IDBDatabase).close();
    },
  });
}

export async function getDevices(): Promise<SyncDevice[]> {
  const db = await openSyncStore();
  try {
    return (await db.getAll('devices')).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  } finally {
    db.close();
  }
}

export async function saveDevice(device: SyncDevice): Promise<SyncDevice> {
  if (!device.deviceId || !device.name.trim()) throw new Error('Invalid device.');
  const db = await openSyncStore();
  try {
    const stored: SyncDevice = { ...device, name: device.name.trim().slice(0, 64) };
    await db.put('devices', stored);
    return stored;
  } finally {
    db.close();
  }
}

export async function touchDevice(
  deviceId: string,
  now = Date.now(),
): Promise<SyncDevice | undefined> {
  const db = await openSyncStore();
  try {
    const tx = db.transaction('devices', 'readwrite');
    const device = await tx.store.get(deviceId);
    if (!device) {
      await tx.done;
      return undefined;
    }
    const updated = { ...device, lastSeenAt: now };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  } finally {
    db.close();
  }
}

export async function getLoans(): Promise<LoanRecord[]> {
  const db = await openSyncStore();
  try {
    return await db.getAll('loans');
  } finally {
    db.close();
  }
}

export async function getLoansForDevice(deviceId: string): Promise<LoanRecord[]> {
  return (await getLoans()).filter((loan) => loan.deviceId === deviceId);
}

export async function getLoanedAudio(loanId: string): Promise<Blob | undefined> {
  const db = await openSyncStore();
  try {
    const stored = await db.get('audio', loanId);
    return stored ? new Blob([stored.bytes], { type: stored.type }) : undefined;
  } finally {
    db.close();
  }
}

/** Exact stored bytes, used to verify a loan before playing it. */
export async function getLoanedBytes(loanId: string): Promise<Uint8Array | undefined> {
  const db = await openSyncStore();
  try {
    const stored = await db.get('audio', loanId);
    return stored ? new Uint8Array(stored.bytes) : undefined;
  } finally {
    db.close();
  }
}

export interface SyncUsage {
  usage: ReturnType<typeof loanUsage>;
  devices: DeviceSummary[];
  deviceCount: number;
}

export async function getSyncUsage(policy: LoanPolicy = DEFAULT_LOAN_POLICY): Promise<SyncUsage> {
  const [loans, devices] = await Promise.all([getLoans(), getDevices()]);
  return {
    usage: loanUsage(loans, validatePolicy(policy)),
    devices: summarizeDevices(loans),
    deviceCount: devices.length,
  };
}

/**
 * Commits a verified loan and its audio atomically, evicting the least recently
 * used unpinned loans only if the new file would not otherwise fit.
 */
export async function commitLoan(
  request: LoanRequest,
  audio: Uint8Array,
  policy: LoanPolicy = DEFAULT_LOAN_POLICY,
  now = Date.now(),
  type = 'application/octet-stream',
): Promise<GrantResult> {
  validatePolicy(policy);
  if (audio.byteLength !== request.size)
    throw new Error('The received file does not match the announced size.');
  const db = await openSyncStore();
  try {
    const tx = db.transaction(['loans', 'audio'], 'readwrite');
    try {
      // Read inside the transaction so two concurrent commits cannot overbook.
      const current = await tx.objectStore('loans').getAll();
      const result = grantLoans(current, [request], policy, now);
      if (!result.granted.length)
        throw new Error(
          result.rejected[0]?.reason === 'too-large'
            ? 'The song does not fit in the borrowed space.'
            : 'There is not enough borrowed space for this song.',
        );
      for (const evicted of result.evicted) {
        await tx.objectStore('loans').delete(evicted.loanId);
        await tx.objectStore('audio').delete(evicted.loanId);
      }
      for (const loan of result.granted) {
        await tx.objectStore('loans').put(loan);
        await tx.objectStore('audio').put({
          loanId: loan.loanId,
          // Copy into a standalone buffer: the transfer array may be a view.
          bytes: audio.slice().buffer as ArrayBuffer,
          type: type.slice(0, 100),
        });
      }
      await tx.done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction may already be aborted by IndexedDB.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}

async function removeLoans(removed: LoanRecord[]): Promise<LoanRecord[]> {
  const db = await openSyncStore();
  try {
    const tx = db.transaction(['loans', 'audio'], 'readwrite');
    for (const loan of removed) {
      await tx.objectStore('loans').delete(loan.loanId);
      await tx.objectStore('audio').delete(loan.loanId);
    }
    await tx.done;
    return removed;
  } finally {
    db.close();
  }
}

/** Deleting a loan frees its exact bytes immediately. */
export async function deleteLoan(loanId: string): Promise<LoanRecord[]> {
  return removeLoans(revokeLoan(await getLoans(), loanId).removed);
}

/** Removes every song borrowed by one offline device. */
export async function deleteDeviceLoans(deviceId: string): Promise<LoanRecord[]> {
  return removeLoans(revokeDevice(await getLoans(), deviceId).removed);
}

/** Forgets a paired device and everything it borrowed. */
export async function forgetDevice(deviceId: string): Promise<void> {
  await deleteDeviceLoans(deviceId);
  const db = await openSyncStore();
  try {
    await db.delete('devices', deviceId);
  } finally {
    db.close();
  }
}

export async function markLoanedUsed(loanIds: string[], now = Date.now()): Promise<void> {
  const db = await openSyncStore();
  try {
    const tx = db.transaction('loans', 'readwrite');
    for (const loanId of loanIds) {
      const loan = await tx.store.get(loanId);
      if (loan) await tx.store.put({ ...loan, lastUsedAt: now });
    }
    await tx.done;
  } finally {
    db.close();
  }
}

export async function clearSyncStore(): Promise<void> {
  const db = await openSyncStore();
  try {
    const tx = db.transaction(['devices', 'loans', 'audio'], 'readwrite');
    await Promise.all([
      tx.objectStore('devices').clear(),
      tx.objectStore('loans').clear(),
      tx.objectStore('audio').clear(),
    ]);
    await tx.done;
  } finally {
    db.close();
  }
}
