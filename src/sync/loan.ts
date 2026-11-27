import { MAX_LOAN_TRACK_BYTES } from './protocol';

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
  capacityBytes: number;

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

export function grantLoans(
  existing: LoanRecord[],
  requests: LoanRequest[],
  policy: LoanPolicy = DEFAULT_LOAN_POLICY,
  now = Date.now(),
): GrantResult {
  validatePolicy(policy);
  const loans = existing.slice();
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

  expiring: number;
}

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
