import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeTrack } from '../test/fixtures';
import { saveClip, loadClips } from '../domain/videoClips';
import { findClip } from '../services/clipSearch';
import { useLibraryClips } from './useLibraryClips';

vi.mock('../services/clipSearch', async (original) => ({
  ...(await original<typeof import('../services/clipSearch')>()),
  findClip: vi.fn(),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(findClip).mockReset();
});
afterEach(() => vi.useRealTimers());

it('requires opt-in and never replaces a clip chosen while searching', async () => {
  const track = makeTrack();
  let finish!: (value: Awaited<ReturnType<typeof findClip>>) => void;
  vi.mocked(findClip).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender, unmount } = renderHook(
    ({ enabled }) => useLibraryClips([track], enabled, true),
    { initialProps: { enabled: false } },
  );
  expect(findClip).not.toHaveBeenCalled();
  rerender({ enabled: true });
  expect(findClip).toHaveBeenCalledTimes(1);
  saveClip(track.id, 'https://www.youtube.com/watch?v=dX3k_QDnzHE');
  await act(async () => {
    finish({
      status: 'found',
      cached: false,
      candidate: { videoId: 'abcdefghijk', title: 'Signal', author: 'Wave', duration: 100 },
    });
    await Promise.resolve();
  });
  expect(loadClips()[track.id].videoId).toBe('dX3k_QDnzHE');
  unmount();
});

it('aborts a pending request when permission is withdrawn', async () => {
  const track = makeTrack();
  vi.mocked(findClip).mockImplementation(() => new Promise(() => {}));
  const { rerender } = renderHook(({ enabled }) => useLibraryClips([track], enabled, true), {
    initialProps: { enabled: true },
  });
  const signal = vi.mocked(findClip).mock.calls[0][1]!.signal!;
  expect(signal.aborted).toBe(false);
  rerender({ enabled: false });
  expect(signal.aborted).toBe(true);
});
