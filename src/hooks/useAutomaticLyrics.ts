import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { lyricsCooldown } from '../services/lyricsCooldown';
import type { Track } from '../domain/types';
import { canLookup, lyricsKey, needsLyrics } from '../domain/lyricsLookup';
import { lookupLyrics, type LyricsResult } from '../services/lyrics';
export function useAutomaticLyrics(
  tracks: Track[],
  enabled: boolean,
  busy: boolean,
  onResult: (id: string, result: LyricsResult) => Promise<void>,
  priority?: string,
) {
  const [loading, setLoading] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  const forced = useRef<string | null>(null),
    nextAllowed = useRef(0),
    generation = useRef(0),
    latest = useRef(tracks);
  useEffect(() => {
    latest.current = tracks;
  }, [tracks]);
  const signature = useMemo(
    () =>
      JSON.stringify(
        tracks.map((track) => [track.id, lyricsKey(track), !!track.lyrics, track.lyricsLookup]),
      ),
    [tracks],
  );
  useEffect(() => {
    const requestId = ++generation.current;
    let notify = setTimeout(() => setLoading(null), 0);
    if (busy)
      return () => {
        clearTimeout(notify);
      };
    const forcedId = forced.current;
    const track =
      (!enabled && !forcedId) || busy
        ? undefined
        : forcedId
          ? latest.current.find((t) => t.id === forcedId)
          : (latest.current.find((t) => t.id === priority && needsLyrics(t)) ??
            latest.current.find((t) => needsLyrics(t)));
    if (!track || !canLookup(track) || (track.lyrics && track.lyrics.source !== 'lrclib')) {
      if (forced.current === forcedId) forced.current = null;
      return () => {
        clearTimeout(notify);
      };
    }
    const controller = new AbortController();
    clearTimeout(notify);
    notify = setTimeout(() => setLoading(track.id), 0);
    const providerRetryAt = latest.current.reduce(
      (max, t) =>
        Number.isFinite(t.lyricsLookup?.retryAt) ? Math.max(max, t.lyricsLookup!.retryAt!) : max,
      0,
    );
    const delay = Math.max(
      450,
      (forcedId ? 0 : nextAllowed.current) - Date.now(),
      providerRetryAt - Date.now(),
      lyricsCooldown() - Date.now(),
    );
    const start = setTimeout(() => {
      void lookupLyrics(track, controller.signal)
        .then(async (result) => {
          if (controller.signal.aborted || generation.current !== requestId) return;
          if (forced.current === forcedId) forced.current = null;
          if (result.lookup.status === 'error')
            nextAllowed.current = result.lookup.retryAt ?? Date.now() + 60_000;
          await onResult(track.id, result);
        })
        .catch(() => {
          // A canceled lookup or failed local write must never overwrite local lyrics.
        })
        .finally(() => {
          if (!controller.signal.aborted && generation.current === requestId) setLoading(null);
        });
    }, delay);
    return () => {
      clearTimeout(start);
      clearTimeout(notify);
      controller.abort();
    };
  }, [signature, enabled, busy, retry, onResult, priority]);
  useEffect(() => {
    if (!enabled || busy) return;
    const now = Date.now();
    const deadlines = tracks
      .filter((t) => !t.lyrics && canLookup(t) && t.lyricsLookup?.status === 'error')
      .map((t) => t.lyricsLookup?.retryAt)
      .filter((time): time is number => Number.isFinite(time) && time! > now);
    if (!deadlines.length) return;
    // Re-evaluate eligibility at the provider deadline, not fifteen minutes later.
    const timer = setTimeout(
      () => setRetry((value) => value + 1),
      Math.min(2_147_483_647, Math.min(...deadlines) - now + 25),
    );
    return () => clearTimeout(timer);
  }, [tracks, enabled, busy]);
  useEffect(() => {
    const online = () => {
      if (!enabled) return;
      const track = latest.current.find(
        (t) => t.id === priority && t.lyricsLookup?.status === 'error' && !t.lyrics && canLookup(t),
      );
      if (track) {
        forced.current = track.id;
        nextAllowed.current = 0;
        setRetry((value) => value + 1);
      }
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [enabled, priority]);
  const retryTrack = useCallback((id: string) => {
    forced.current = id;
    setRetry((value) => value + 1);
  }, []);
  return { loading: !busy ? loading : null, retryTrack };
}
