import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAutomaticLyrics } from './useAutomaticLyrics';
import { lookupLyrics } from '../services/lyrics';
import { makeTrack } from '../test/fixtures';
import { lyricsKey } from '../domain/lyricsLookup';
import { parseLyrics } from '../domain/lyrics';
vi.mock('../services/lyrics', () => ({ lookupLyrics: vi.fn() }));
afterEach(() => vi.useRealTimers());
it('clears loading after a saved result changes the signature, and allows one deliberate retry', async () => {
  vi.useFakeTimers();
  const track = makeTrack(),
    result = {
      lookup: { key: lyricsKey(track), checkedAt: Date.now(), status: 'not-found' as const },
    };
  vi.mocked(lookupLyrics).mockResolvedValue(result);
  const saved = vi.fn().mockResolvedValue(undefined);
  const { result: hook, rerender } = renderHook(
    ({ tracks }) => useAutomaticLyrics(tracks, true, false, saved),
    { initialProps: { tracks: [track] } },
  );
  await act(() => vi.advanceTimersByTimeAsync(450));
  expect(saved).toHaveBeenCalledTimes(1);
  expect(hook.current.loading).toBeNull();
  rerender({ tracks: [{ ...track, lyricsLookup: result.lookup }] });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(saved).toHaveBeenCalledTimes(1);
  act(() => hook.current.retryTrack(track.id));
  await act(() => vi.advanceTimersByTimeAsync(450));
  expect(saved).toHaveBeenCalledTimes(2);
  expect(hook.current.loading).toBeNull();
});
it('pauses during import, respects opt-out, skips local lyrics and aborts on opt-out', async () => {
  vi.useFakeTimers();
  const track = makeTrack();
  const saved = vi.fn().mockResolvedValue(undefined);
  vi.mocked(lookupLyrics).mockImplementation(() => new Promise(() => {}));
  const { rerender } = renderHook(
    ({ enabled, busy, tracks }) => useAutomaticLyrics(tracks, enabled, busy, saved),
    { initialProps: { enabled: false, busy: false, tracks: [track] } },
  );
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(lookupLyrics).not.toHaveBeenCalled();
  rerender({ enabled: true, busy: true, tracks: [track] });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(lookupLyrics).not.toHaveBeenCalled();
  rerender({
    enabled: true,
    busy: false,
    tracks: [{ ...track, lyrics: parseLyrics('[00:00]Local') }],
  });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(lookupLyrics).not.toHaveBeenCalled();
  rerender({ enabled: true, busy: false, tracks: [track] });
  await act(() => vi.advanceTimersByTimeAsync(450));
  const signal = vi.mocked(lookupLyrics).mock.calls[0][1];
  rerender({ enabled: false, busy: false, tracks: [track] });
  expect(signal.aborted).toBe(true);
  expect(saved).not.toHaveBeenCalled();
});
it('retries a deliberate request with corrected decoder metadata even while automatic lookup is off', async () => {
  vi.useFakeTimers();
  const track = makeTrack(),
    saved = vi.fn().mockResolvedValue(undefined);
  vi.mocked(lookupLyrics).mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(
    ({ tracks }) => useAutomaticLyrics(tracks, false, false, saved),
    { initialProps: { tracks: [track] } },
  );
  act(() => result.current.retryTrack(track.id));
  await act(() => vi.advanceTimersByTimeAsync(450));
  const signal = vi.mocked(lookupLyrics).mock.calls[0][1];
  rerender({ tracks: [{ ...track, duration: 120 }] });
  expect(signal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(450));
  expect(lookupLyrics).toHaveBeenCalledTimes(2);
  expect(vi.mocked(lookupLyrics).mock.calls[1][0].duration).toBe(120);
  expect(saved).not.toHaveBeenCalled();
});
it('keeps the current request loading when a canceled older request finally settles', async () => {
  vi.useFakeTimers();
  const track = makeTrack(),
    saved = vi.fn().mockResolvedValue(undefined);
  let rejectFirst!: (e: Error) => void;
  vi.mocked(lookupLyrics)
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    )
    .mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(
    ({ tracks }) => useAutomaticLyrics(tracks, false, false, saved),
    { initialProps: { tracks: [track] } },
  );
  act(() => result.current.retryTrack(track.id));
  await act(() => vi.advanceTimersByTimeAsync(450));
  rerender({ tracks: [{ ...track, duration: 120 }] });
  await act(() => vi.advanceTimersByTimeAsync(450));
  await act(async () => {
    rejectFirst(new Error('Aborted'));
    await Promise.resolve();
  });
  expect(result.current.loading).toBe(track.id);
  expect(saved).not.toHaveBeenCalled();
});
it('shows a scheduled manual lookup during persisted provider cooldown, without sending early', async () => {
  vi.useFakeTimers();
  const track = makeTrack({
      lyricsLookup: {
        key: 'old',
        status: 'error',
        checkedAt: Date.now(),
        retryAt: Date.now() + 60_000,
      },
    }),
    saved = vi.fn().mockResolvedValue(undefined);
  vi.mocked(lookupLyrics).mockResolvedValue({
    lookup: { key: lyricsKey(track), checkedAt: Date.now(), status: 'not-found' },
  });
  const { result } = renderHook(() => useAutomaticLyrics([track], false, false, saved));
  act(() => result.current.retryTrack(track.id));
  await act(() => vi.advanceTimersByTimeAsync(450));
  expect(result.current.loading).toBe(track.id);
  expect(lookupLyrics).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(lookupLyrics).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBeNull();
});
it('retains a manual request interrupted by import and resumes afterward', async () => {
  vi.useFakeTimers();
  const track = makeTrack(),
    saved = vi.fn().mockResolvedValue(undefined);
  vi.mocked(lookupLyrics).mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(
    ({ busy }) => useAutomaticLyrics([track], false, busy, saved),
    { initialProps: { busy: false } },
  );
  act(() => result.current.retryTrack(track.id));
  rerender({ busy: true });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(lookupLyrics).not.toHaveBeenCalled();
  rerender({ busy: false });
  await act(() => vi.advanceTimersByTimeAsync(450));
  expect(lookupLyrics).toHaveBeenCalledTimes(1);
});
