import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOAN_POLICY,
  evictionOrder,
  grantLoans,
  loanUsage,
  markLoansUsed,
  pruneExpired,
  revokeDevice,
  revokeLoan,
  suggestPolicy,
  summarizeDevices,
  type LoanRecord,
  type LoanRequest,
} from './loan';

const MB = 1024 * 1024;
const loan = (over: Partial<LoanRecord> & { loanId: string }): LoanRecord => ({
  trackId: `t-${over.loanId}`,
  deviceId: 'phone',
  size: 10 * MB,
  grantedAt: 1,
  lastUsedAt: 1,
  pinned: false,
  ...over,
});
const request = (over: Partial<LoanRequest> & { loanId: string; size: number }): LoanRequest => ({
  trackId: `t-${over.loanId}`,
  deviceId: 'phone',
  ...over,
});

describe('loan policy', () => {
  it('grants loans that fit and reports usage', () => {
    const result = grantLoans([], [request({ loanId: 'a', size: 10 * MB })], {
      capacityBytes: 100 * MB,
      maxTracks: 10,
    });
    expect(result.granted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
    const usage = loanUsage(result.loans, { capacityBytes: 100 * MB, maxTracks: 10 });
    expect(usage).toMatchObject({ bytes: 10 * MB, tracks: 1, freeBytes: 90 * MB, full: false });
  });

  it('never removes a loan to make room for a new one', () => {
    const existing = [
      loan({ loanId: 'old', lastUsedAt: 10 }),
      loan({ loanId: 'new', lastUsedAt: 90 }),
    ];
    const result = grantLoans(existing, [request({ loanId: 'extra', size: 15 * MB })], {
      capacityBytes: 30 * MB,
      maxTracks: 10,
    });
    // 20 MB are already borrowed of a 30 MB budget. The listener's songs stay
    // where they are, and the new request is refused with a reason the page can
    // show, so nothing disappears behind their back.
    expect(result.evicted).toEqual([]);
    expect(result.granted).toEqual([]);
    expect(result.rejected[0].reason).toBe('capacity');
    expect(result.loans.map((entry) => entry.loanId)).toEqual(['old', 'new']);
  });

  it('never evicts pinned loans and rejects what cannot fit', () => {
    const existing = [loan({ loanId: 'keep', pinned: true, size: 30 * MB })];
    const result = grantLoans(existing, [request({ loanId: 'extra', size: 15 * MB })], {
      capacityBytes: 30 * MB,
      maxTracks: 10,
    });
    expect(result.evicted).toEqual([]);
    // 30 MB are pinned inside a 35 MB budget, so 15 MB can never fit.
    expect(result.rejected).toEqual([
      { request: request({ loanId: 'extra', size: 15 * MB }), reason: 'too-large' },
    ]);
    expect(result.loans.map((entry) => entry.loanId)).toEqual(['keep']);

    const tooLarge = grantLoans([], [request({ loanId: 'huge', size: 150 * MB })], {
      capacityBytes: 100 * MB,
      maxTracks: 10,
    });
    expect(tooLarge.rejected[0].reason).toBe('too-large');
    // Above the 200 MB per-file ceiling a loan is not a capacity problem.
    const oversized = grantLoans([], [request({ loanId: 'oversized', size: 500 * MB })]);
    expect(oversized.rejected[0].reason).toBe('invalid');
  });

  it('rejects duplicates, invalid sizes and count limits', () => {
    const existing = [loan({ loanId: 'a', trackId: 't1' })];
    const duplicate = grantLoans(
      existing,
      [request({ loanId: 'b', size: 1 * MB, trackId: 't1' })],
      {
        capacityBytes: 100 * MB,
        maxTracks: 10,
      },
    );
    expect(duplicate.rejected[0].reason).toBe('duplicate');
    const invalid = grantLoans([], [request({ loanId: 'c', size: 0 })]);
    expect(invalid.rejected[0].reason).toBe('invalid');
    const limit = grantLoans(
      [loan({ loanId: 'a', pinned: true })],
      [request({ loanId: 'b', size: 1 * MB })],
      {
        capacityBytes: 100 * MB,
        maxTracks: 1,
      },
    );
    expect(limit.rejected[0].reason).toBe('limit');
  });

  it('orders eviction deterministically when timestamps collide', () => {
    const list = [
      loan({ loanId: 'c' }),
      loan({ loanId: 'a' }),
      loan({ loanId: 'b', pinned: true }),
    ];
    expect(evictionOrder(list).map((entry) => entry.loanId)).toEqual(['a', 'c']);
  });

  it('revokes single loans and whole offline devices', () => {
    const loans = [
      loan({ loanId: 'a', deviceId: 'phone' }),
      loan({ loanId: 'b', deviceId: 'phone' }),
      loan({ loanId: 'c', deviceId: 'tablet' }),
    ];
    expect(revokeLoan(loans, 'a').loans.map((entry) => entry.loanId)).toEqual(['b', 'c']);
    const byDevice = revokeDevice(loans, 'phone');
    expect(byDevice.removed).toHaveLength(2);
    expect(byDevice.loans.map((entry) => entry.loanId)).toEqual(['c']);
  });

  it('tracks use, optional expiry and per-device summaries', () => {
    const loans = [
      loan({ loanId: 'a', deviceId: 'phone', lastUsedAt: 10 }),
      loan({ loanId: 'b', deviceId: 'tablet', lastUsedAt: 50, expiresAt: 100 }),
    ];
    expect(markLoansUsed(loans, ['a'], 999)[0].lastUsedAt).toBe(999);
    const summaries = summarizeDevices(loans);
    expect(summaries.map((entry) => entry.deviceId)).toEqual(['tablet', 'phone']);
    expect(summaries[0].expiring).toBe(1);
    const pruned = pruneExpired(loans, 150);
    expect(pruned.removed.map((entry) => entry.loanId)).toEqual(['b']);
    expect(pruneExpired(loans, 50).removed).toEqual([]);
  });

  it('validates policies and suggests a bounded capacity', () => {
    expect(() => loanUsage([], { capacityBytes: -1, maxTracks: 1 })).toThrow();
    expect(() => grantLoans([], [], { capacityBytes: 1, maxTracks: 0 })).toThrow();
    expect(suggestPolicy(0)).toEqual(DEFAULT_LOAN_POLICY);
    expect(suggestPolicy(8 * 1024 * MB).capacityBytes).toBe(2 * 1024 * MB);
    expect(suggestPolicy(100 * MB).capacityBytes).toBe(512 * MB);
  });
});
