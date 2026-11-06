import { useCallback, useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, it, vi, expect } from 'vitest';
import { measureVolume, type VolumeFix } from '../audio/volumeFix';
import { makeTrack } from '../test/fixtures';
import { useVolumeFix } from './useVolumeFix';
vi.mock('../audio/volumeFix', () => ({ measureVolume: vi.fn() }));
const fix: VolumeFix = { gain: 3, rmsDb: -28, peakDb: -16, measuredAt: 1 };
beforeEach(() => {
  vi.stubGlobal('AudioContext', class {});
  vi.stubGlobal('OfflineAudioContext', class {});
  vi.stubGlobal('Worker', class {});
  vi.mocked(measureVolume).mockReset().mockResolvedValue(fix);
});
afterEach(() => vi.unstubAllGlobals());
it('does no work while disabled or importing', () => {
  const save = vi.fn();
  const tracks = [makeTrack()];
  const { rerender } = renderHook(
    ({ enabled, busy }) => useVolumeFix(tracks, enabled, busy, save),
    { initialProps: { enabled: false, busy: false } },
  );
  expect(measureVolume).not.toHaveBeenCalled();
  rerender({ enabled: true, busy: true });
  expect(measureVolume).not.toHaveBeenCalled();
});
it('balances the whole library sequentially and picks up future imports without rescanning saved gains', async () => {
  let active = 0,
    maximum = 0;
  vi.mocked(measureVolume).mockImplementation(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
    return fix;
  });
  const { result } = renderHook(() => {
    const [tracks, setTracks] = useState([makeTrack(), makeTrack({ id: 'second' })]);
    const save = useCallback(async (id: string, volumeFix: VolumeFix) => {
      setTracks((all) => all.map((track) => (track.id === id ? { ...track, volumeFix } : track)));
    }, []);
    return {
      status: useVolumeFix(tracks, true, false, save),
      add: () => setTracks((all) => [...all, makeTrack({ id: 'future' })]),
    };
  });
  await waitFor(() => expect(result.current.status.ready).toBe(2));
  expect(maximum).toBe(1);
  act(() => result.current.add());
  await waitFor(() => expect(result.current.status.ready).toBe(3));
  expect(measureVolume).toHaveBeenCalledTimes(3);
});
it('cancels an in-flight job when disabled and never saves its late result', async () => {
  let finish!: (fix: VolumeFix) => void;
  vi.mocked(measureVolume).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const tracks = [makeTrack()],
    save = vi.fn();
  const { rerender } = renderHook(({ enabled }) => useVolumeFix(tracks, enabled, false, save), {
    initialProps: { enabled: true },
  });
  const signal = vi.mocked(measureVolume).mock.calls[0][2]!;
  rerender({ enabled: false });
  expect(signal.aborted).toBe(true);
  await act(async () => finish(fix));
  expect(save).not.toHaveBeenCalled();
});
it('skips oversized and unknown recordings and continues past an unreadable source', async () => {
  vi.mocked(measureVolume).mockRejectedValue(Error('unreadable'));
  const tracks = [
    makeTrack(),
    makeTrack({ id: 'long', duration: 1000 }),
    makeTrack({ id: 'unknown', duration: 0 }),
  ];
  const { result } = renderHook(() => useVolumeFix(tracks, true, false, vi.fn()));
  await waitFor(() => expect(result.current.skipped).toBe(3));
  expect(result.current.working).toBe(false);
  expect(measureVolume).toHaveBeenCalledTimes(1);
});
