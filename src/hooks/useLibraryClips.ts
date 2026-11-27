import { useEffect, useMemo, useRef } from 'react';
import { clipExcluded, getClip, loadClips } from '../domain/videoClips';
import type { Track } from '../domain/types';
import { findClip, rememberClip } from '../services/clipSearch';

/** Optional, bounded background search. The opt-in is separate from playback. */
export function useLibraryClips(tracks: Track[], enabled: boolean, online: boolean) {
  const latest = useRef(tracks);
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    latest.current = tracks;
  }, [tracks]);
  const signature = useMemo(
    () =>
      JSON.stringify(
        tracks.map((track) => [
          track.id,
          track.title,
          track.artist,
          track.duration,
          track.fileName,
          track.rolesReviewed,
          track.source,
        ]),
      ),
    [tracks],
  );
  useEffect(() => {
    if (!enabled || !online) return;
    const controller = new AbortController();
    const attempts = attempted.current;
    let activeKey: string | undefined;
    const run = async () => {
      for (const track of latest.current) {
        if (controller.signal.aborted) break;
        const key = JSON.stringify([track.id, track.title, track.artist, track.duration]);
        if (
          attempts.has(key) ||
          track.source === 'youtube' ||
          !track.title ||
          !track.artist ||
          clipExcluded(track.id) ||
          getClip(track.id, loadClips())
        )
          continue;
        attempts.add(key);
        activeKey = key;
        try {
          const result = await findClip(track, { signal: controller.signal });
          const current = latest.current.find((item) => item.id === track.id);
          if (controller.signal.aborted) {
            break;
          }
          if (
            result.status === 'found' &&
            current &&
            current.title === track.title &&
            current.artist === track.artist &&
            current.duration === track.duration &&
            !clipExcluded(track.id) &&
            !getClip(track.id, loadClips())
          ) {
            rememberClip(track.id, result.candidate, track.duration);
          }
        } catch {
          /* Retry on a later session if the provider is unavailable. */
        }
        activeKey = undefined;
        if (controller.signal.aborted) break;
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = setTimeout(finish, 1200);
          controller.signal.addEventListener('abort', finish, { once: true });
        });
      }
    };
    void run();
    return () => {
      if (activeKey) attempts.delete(activeKey);
      controller.abort();
    };
  }, [enabled, online, signature]);
}
