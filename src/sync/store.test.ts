import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSyncStore,
  commitLoan,
  deleteDeviceLoans,
  deleteLoan,
  forgetDevice,
  getDevices,
  getLoanedAudio,
  getLoans,
  getSyncUsage,
  markLoanedUsed,
  saveDevice,
  touchDevice,
} from './store';
import { DEFAULT_LOAN_POLICY, type LoanRequest } from './loan';

const MB = 1024 * 1024;
const request = (loanId: string, size = 4 * MB): LoanRequest => ({
  loanId,
  trackId: `track-${loanId}`,
  deviceId: 'phone',
  size,
  title: 'Song',
  artist: 'Artist',
});
const bytes = (size: number) => Uint8Array.from({ length: size }, (_, index) => index % 251);

beforeEach(async () => {
  await clearSyncStore();
});

describe('sync store', () => {
  it('stores verified loans with their audio', async () => {
    const result = await commitLoan(request('loan-1'), bytes(4 * MB));
    expect(result.granted).toHaveLength(1);
    expect(await getLoans()).toHaveLength(1);
    const audio = await getLoanedAudio('loan-1');
    expect(audio?.size).toBe(4 * MB);
    const usage = await getSyncUsage();
    expect(usage.usage).toMatchObject({ bytes: 4 * MB, tracks: 1 });
  });

  it('refuses audio whose size disagrees with the announcement', async () => {
    await expect(commitLoan(request('loan-1'), bytes(10))).rejects.toThrow(/announced size/);
    expect(await getLoans()).toEqual([]);
    expect(await getLoanedAudio('loan-1')).toBeUndefined();
  });

  it('refuses a second loan instead of deleting the first', async () => {
    const policy = { capacityBytes: 10 * MB, maxTracks: 10 };
    await commitLoan(request('loan-1', 6 * MB), bytes(6 * MB), policy, 1_000);
    await expect(
      commitLoan(request('loan-2', 6 * MB), bytes(6 * MB), policy, 2_000),
    ).rejects.toThrow(/borrowed space/);
    // What the listener already has stays exactly where it is.
    expect((await getLoans()).map((loan) => loan.loanId)).toEqual(['loan-1']);
    expect((await getLoanedAudio('loan-1'))?.size).toBe(6 * MB);
    expect(await getLoanedAudio('loan-2')).toBeUndefined();
  });

  it('rejects a loan that cannot fit at all and keeps existing data', async () => {
    const policy = { capacityBytes: 10 * MB, maxTracks: 10 };
    await commitLoan(request('loan-1', 8 * MB), bytes(8 * MB), policy);
    await expect(commitLoan(request('loan-2', 11 * MB), bytes(11 * MB), policy)).rejects.toThrow(
      /borrowed space/,
    );
    expect(await getLoans()).toHaveLength(1);
    expect((await getLoanedAudio('loan-1'))?.size).toBe(8 * MB);
  });

  it('deletes a single loan or every loan of a device, freeing audio', async () => {
    await commitLoan(request('loan-1'), bytes(4 * MB));
    await commitLoan({ ...request('loan-2'), deviceId: 'tablet' }, bytes(4 * MB));
    const removed = await deleteLoan('loan-1');
    expect(removed.map((loan) => loan.loanId)).toEqual(['loan-1']);
    expect(await getLoanedAudio('loan-1')).toBeUndefined();
    expect(await getLoanedAudio('loan-2')).toBeDefined();

    await deleteDeviceLoans('tablet');
    expect(await getLoans()).toEqual([]);
    expect(await getLoanedAudio('loan-2')).toBeUndefined();
  });

  it('remembers paired devices and forgets them with their loans', async () => {
    await saveDevice({
      deviceId: 'phone',
      name: '  Phone  ',
      platform: 'android',
      pairedAt: 1,
      lastSeenAt: 1,
    });
    expect((await getDevices())[0]).toMatchObject({ name: 'Phone', platform: 'android' });
    expect(await touchDevice('phone', 50)).toMatchObject({ lastSeenAt: 50 });
    expect(await touchDevice('unknown', 50)).toBeUndefined();

    await commitLoan(request('loan-1', 1024), bytes(1024));
    await forgetDevice('phone');
    expect(await getDevices()).toEqual([]);
    expect(await getLoans()).toEqual([]);
    expect(await getLoanedAudio('loan-1')).toBeUndefined();
  });

  it('records when a borrowed song was last played, without touching the rest', async () => {
    const policy = { capacityBytes: 20 * MB, maxTracks: 10 };
    await commitLoan(request('loan-1', 5 * MB), bytes(5 * MB), policy, 1_000);
    await commitLoan(request('loan-2', 5 * MB), bytes(5 * MB), policy, 2_000);
    await markLoanedUsed(['loan-1'], 9_000);
    const loans = await getLoans();
    expect(loans.map((loan) => loan.loanId).sort()).toEqual(['loan-1', 'loan-2']);
    expect(loans.find((loan) => loan.loanId === 'loan-1')?.lastUsedAt).toBe(9_000);
  });

  it('reports usage against the active policy', async () => {
    await commitLoan(request('loan-1'), bytes(4 * MB));
    const usage = await getSyncUsage({ ...DEFAULT_LOAN_POLICY, capacityBytes: 8 * MB });
    expect(usage.usage).toMatchObject({ bytes: 4 * MB, freeBytes: 4 * MB, full: false });
    expect(usage.devices[0]).toMatchObject({ deviceId: 'phone', tracks: 1 });
  });
});
