import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('recovers after a queued cancellation without starting that task', async () => {
  vi.useFakeTimers();
  const { lyricsRequest } = await import('./lyricsRequests');
  let finish!: (value: string) => void;
  const first = lyricsRequest(
    new AbortController().signal,
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const cancelled = new AbortController();
  const task = vi.fn().mockResolvedValue('never');
  const second = lyricsRequest(cancelled.signal, task);
  const rejection = expect(second).rejects.toMatchObject({ name: 'AbortError' });
  const third = lyricsRequest(new AbortController().signal, async () => 'next');
  await vi.advanceTimersByTimeAsync(0);
  cancelled.abort();
  finish('first');
  await vi.advanceTimersByTimeAsync(500);
  expect(await first).toBe('first');
  await rejection;
  expect(await third).toBe('next');
  expect(task).not.toHaveBeenCalled();
});

it('uses a same-origin Web Lock when the browser supports it', async () => {
  const request = vi.fn((_name: string, _options: unknown, callback: () => Promise<string>) =>
    callback(),
  );
  vi.stubGlobal('navigator', { locks: { request } });
  const { lyricsRequest } = await import('./lyricsRequests');
  const controller = new AbortController();
  expect(await lyricsRequest(controller.signal, async () => 'locked')).toBe('locked');
  expect(request).toHaveBeenCalledWith(
    'wave-lyrics-provider',
    { signal: controller.signal },
    expect.any(Function),
  );
});

it('retains the provider deadline in memory when a quota prevents writing storage', async () => {
  vi.useFakeTimers();
  const { lyricsCooldown, rememberLyricsCooldown } = await import('./lyricsCooldown');
  const { lyricsRequest } = await import('./lyricsRequests');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota', 'QuotaExceededError');
  });
  const deadline = Date.now() + 2000;
  rememberLyricsCooldown(deadline);
  expect(lyricsCooldown()).toBe(deadline);
  const task = vi.fn().mockResolvedValue('not yet');
  await expect(lyricsRequest(new AbortController().signal, task)).rejects.toMatchObject({
    retryAt: deadline,
  });
  expect(task).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2001);
  expect(await lyricsRequest(new AbortController().signal, task)).toBe('not yet');
});
