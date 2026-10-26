import { MAX_LOAN_TRACK_BYTES } from './protocol';

/**
 * Temporary loans between devices.
 *
 * The user's decision for Wave 1.1 is deliberately simple: **loans are bounded
 * by space, not by a timer.** The borrowing device shows a list of offline
 * devices and can delete any loan (or a whole device) at any time; the granting
 * device can revoke what it shared. Nothing renews silently and nothing is
 * deleted behind the user's back, with one exception: when a new loan does not
 * fit, the least recently used unpinned loan is evicted first, and that eviction
 * is reported so the interface can explain it.
 *
 * `expiresAt` exists in the model only for a future explicit option and is
 * ignored unless a caller sets it.
 */
export interface LoanRecord {
  loanId: string;
  trackId: string;
  deviceId: string;
  size: number;
  grantedAt: number;
  lastUsedAt: number;
  pinned: boolean;
  expiresAt?: number;
  title?: string;
  artist?: string;
}

export interface LoanRequest {
  loanId: string;
  trackId: string;
  deviceId: string;
  size: number;
  pinned?: boolean;
  title?: string;
  artist?: string;
}

export interface LoanPolicy {
  /** Total bytes of borrowed audio this device may hold. */
  capacityBytes: number;
  /** Total number of borrowed tracks. */
  maxTracks: number;
}

export const DEFAULT_LOAN_POLICY: LoanPolicy = {
  capacityBytes: 2 * 1024 * 1024 * 1024,
  maxTracks: 2000,
};

export type LoanRejection = 'duplicate' | 'too-large' | 'capacity' | 'limit' | 'invalid';

export interface GrantResult {
  loans: LoanRecord[];
  granted: LoanRecord[];
  /** Unpinned loans removed to make room, oldest first. */
  evicted: LoanRecord[];
  rejected: { request: LoanRequest; reason: LoanRejection }[];
}

export function validatePolicy(policy: LoanPolicy): LoanPolicy {
  if (
    !Number.isSafeInteger(policy.capacityBytes) ||
    policy.capacityBytes < 0 ||
    !Number.isSafeInteger(policy.maxTracks) ||
    policy.maxTracks < 1
  )
    throw new Error('Invalid loan policy.');
  return policy;
}

const validRequest = (request: LoanRequest): boolean =>
  Boolean(request.loanId && request.trackId && request.deviceId) &&
  Number.isSafeInteger(request.size) &&
  request.size > 0 &&
  request.size <= MAX_LOAN_TRACK_BYTES;

export interface LoanUsage {
  bytes: number;
  tracks: number;
  pinnedBytes: number;
  capacityBytes: number;
  maxTracks: number;
  freeBytes: number;
  /** True when capacity or count is reached; unpinned loans may be evicted. */
  full: boolean;
}

export function loanUsage(
  loans: LoanRecord[],
  policy: LoanPolicy = DEFAULT_LOAN_POLICY,
): LoanUsage {
  validatePolicy(policy);
  let bytes = 0;
  let pinnedBytes = 0;
  for (const loan of loans) {
    bytes += loan.size;
    if (loan.pinned) pinnedBytes += loan.size;
  }
  return {
    bytes,
    tracks: loans.length,
    pinnedBytes,
    capacityBytes: policy.capacityBytes,
    maxTracks: policy.maxTracks,
    freeBytes: Math.max(0, policy.capacityBytes - bytes),
    full: bytes >= policy.capacityBytes || loans.length >= policy.maxTracks,
  };
}

/** Oldest first; deterministic even when timestamps collide. */
export function evictionOrder(loans: LoanRecord[]): LoanRecord[] {
  return loans
    .filter((loan) => !loan.pinned)
    .slice()
    .sort(
      (a, b) =>
        a.lastUsedAt - b.lastUsedAt ||
        a.grantedAt - b.grantedAt ||
        a.loanId.localeCompare(b.loanId),
    );
}

/**
 * Grants what fits. Requests keep their order, duplicates are rejected, and
 * unpinned loans are evicted least-recently-used first. Pinned loans are never
 * evicted, so a request that cannot fit next to them is rejected instead.
 */
export function grantLoans(
  existing: LoanRecord[],
  requests: LoanRequest[],
  policy: LoanPolicy = DEFAULT_LOAN_POLICY,
  now = Date.now(),
): GrantResult {
  validatePolicy(policy);
  let loans = existing.slice();
  const granted: LoanRecord[] = [];
  const evicted: LoanRecord[] = [];
  const rejected: GrantResult['rejected'] = [];

  for (const request of requests) {
    if (!validRequest(request)) {
      rejected.push({ request, reason: 'invalid' });
      continue;
    }
    if (
      loans.some((loan) => loan.trackId === request.trackId && loan.deviceId === request.deviceId)
    ) {
      rejected.push({ request, reason: 'duplicate' });
      continue;
    }
    const pinnedBytes = loans
      .filter((loan) => loan.pinned)
      .reduce((sum, loan) => sum + loan.size, 0);
    const pinnedCount = loans.filter((loan) => loan.pinned).length;
    if (request.size > policy.capacityBytes - pinnedBytes || pinnedCount >= policy.maxTracks) {
      rejected.push({
        request,
        reason: request.size > policy.capacityBytes - pinnedBytes ? 'too-large' : 'limit',
      });
      continue;
    }

    const sizeOf = (list: LoanRecord[]) => list.reduce((sum, loan) => sum + loan.size, 0);
    while (
      loans.length + 1 > policy.maxTracks ||
      sizeOf(loans) + request.size > policy.capacityBytes
    ) {
      const [next] = evictionOrder(loans);
      if (!next) break;
      loans = loans.filter((loan) => loan.loanId !== next.loanId);
      evicted.push(next);
    }
    if (
      loans.length + 1 > policy.maxTracks ||
      sizeOf(loans) + request.size > policy.capacityBytes
    ) {
      rejected.push({
        request,
        reason: sizeOf(loans) + request.size > policy.capacityBytes ? 'capacity' : 'limit',
      });
      continue;
    }

    const loan: LoanRecord = {
      loanId: request.loanId,
      trackId: request.trackId,
      deviceId: request.deviceId,
      size: request.size,
      grantedAt: now,
      lastUsedAt: now,
      pinned: request.pinned === true,
      ...(request.title ? { title: request.title } : {}),
      ...(request.artist ? { artist: request.artist } : {}),
    };
    loans.push(loan);
    granted.push(loan);
  }

  return { loans, granted, evicted, rejected };
}

export interface RevokeResult {
  loans: LoanRecord[];
  removed: LoanRecord[];
}

export function revokeLoan(loans: LoanRecord[], loanId: string): RevokeResult {
  const removed = loans.filter((loan) => loan.loanId === loanId);
  return { loans: loans.filter((loan) => loan.loanId !== loanId), removed };
}

export function revokeDevice(loans: LoanRecord[], deviceId: string): RevokeResult {
  const removed = loans.filter((loan) => loan.deviceId === deviceId);
  return { loans: loans.filter((loan) => loan.deviceId !== deviceId), removed };
}

export function markLoansUsed(
  loans: LoanRecord[],
  loanIds: string[],
  now = Date.now(),
): LoanRecord[] {
  const touched = new Set(loanIds);
  return loans.map((loan) => (touched.has(loan.loanId) ? { ...loan, lastUsedAt: now } : loan));
}

/** Only affects loans whose owner explicitly set an expiry. */
export function pruneExpired(loans: LoanRecord[], now = Date.now()): RevokeResult {
  const removed = loans.filter((loan) => loan.expiresAt !== undefined && loan.expiresAt <= now);
  return {
    loans: loans.filter((loan) => !(loan.expiresAt !== undefined && loan.expiresAt <= now)),
    removed,
  };
}

export interface DeviceSummary {
  deviceId: string;
  bytes: number;
  tracks: number;
  lastUsedAt: number;
  /** Tracks with an explicit expiry, informational only. */
  expiring: number;
}

/** Powers the "Offline devices" list: what is stored, for whom, and how much. */
export function summarizeDevices(loans: LoanRecord[]): DeviceSummary[] {
  const map = new Map<string, DeviceSummary>();
  for (const loan of loans) {
    const current = map.get(loan.deviceId) ?? {
      deviceId: loan.deviceId,
      bytes: 0,
      tracks: 0,
      lastUsedAt: 0,
      expiring: 0,
    };
    current.bytes += loan.size;
    current.tracks += 1;
    current.lastUsedAt = Math.max(current.lastUsedAt, loan.lastUsedAt);
    if (loan.expiresAt !== undefined) current.expiring += 1;
    map.set(loan.deviceId, current);
  }
  return [...map.values()].sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt || a.deviceId.localeCompare(b.deviceId),
  );
}

/** Suggests a capacity policy from the device's reported free space. */
export function suggestPolicy(
  freeBytes: number,
  policy: LoanPolicy = DEFAULT_LOAN_POLICY,
): LoanPolicy {
  const usable = Number.isFinite(freeBytes) && freeBytes > 0 ? Math.floor(freeBytes * 0.25) : 0;
  return {
    capacityBytes: Math.max(
      512 * 1024 * 1024,
      Math.min(policy.capacityBytes, usable || policy.capacityBytes),
    ),
    maxTracks: policy.maxTracks,
  };
}
