import { lyricsCooldown } from './lyricsCooldown';

const GAP = 500;
const NEXT = 'wave-lyrics-next-request-at';
let tail: Promise<unknown> = Promise.resolve();
let nextStart = 0;

export class LyricsPaused extends Error {
  constructor(public readonly retryAt: number) {
    super('Service cooldown.');
  }
}

function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function wait(ms: number, signal: AbortSignal) {
  cancelled(signal);
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

/** One provider-wide queue, shared by automatic lookups and the lyric editor. */
export function lyricsRequest<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  const run = async () => {
    const execute = async () => {
      cancelled(signal);
      let stored = 0;
      try {
        stored = Number(localStorage.getItem(NEXT)) || 0;
      } catch {
        // The in-memory queue still works when storage is unavailable.
      }
      const checkPause = () => {
        const retryAt = lyricsCooldown();
        if (retryAt > Date.now()) throw new LyricsPaused(retryAt);
      };
      checkPause();
      // Bound only the request-spacing marker, never a provider Retry-After deadline.
      await wait(Math.min(GAP, Math.max(nextStart, stored) - Date.now()), signal);
      cancelled(signal);
      checkPause();
      nextStart = Date.now() + GAP;
      try {
        localStorage.setItem(NEXT, String(nextStart));
      } catch {
        // No metadata or lyrics are written by this scheduler.
      }
      return task();
    };
    // Web Locks coordinates the same origin's tabs without an extra server/service.
    if (navigator.locks?.request)
      return navigator.locks.request('wave-lyrics-provider', { signal }, execute);
    return execute();
  };
  const result = tail.then(run, run);
  // An aborted/failed caller must never poison the next queued request.
  tail = result.catch(() => undefined);
  return result;
}
