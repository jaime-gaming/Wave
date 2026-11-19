import { useCallback, useEffect, useRef, useState } from 'react';
import { measureVolume, type VolumeFix } from '../audio/volumeFix';
import { VOLUME_FIX_VERSION } from '../audio/volumeAnalysis';
import type { Track } from '../domain/types';

function needsMeasurement(track: Track, doneThisSession: Set<string>): boolean {
  if (!track.volumeFix) return true;
  if (doneThisSession.has(track.id)) return false;
  return (track.volumeFix.algorithmVersion ?? 1) < VOLUME_FIX_VERSION;
}

/** One local scan at a time, owned by the app rather than the Settings page. */
export function useVolumeFix(
  tracks: Track[],
  enabled: boolean,
  busy: boolean,
  onSave: (id: string, fix: VolumeFix) => Promise<void>,
  priority?: string,
) {
  const [revision, refresh] = useState(0);
  const [requested, setRequested] = useState<string | null>(null);
  const latest = useRef({ tracks, onSave });
  const [failed, setFailed] = useState(() => new Set<string>());
  const [measuredInSession, setMeasuredInSession] = useState(() => new Set<string>());
  const job = useRef<{ controller: AbortController; id: string; blob: Blob } | null>(null);
  const mounted = useRef(false);
  const supported =
    typeof OfflineAudioContext !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof Worker !== 'undefined';
  useEffect(() => {
    latest.current = { tracks, onSave };
  }, [tracks, onSave]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      job.current?.controller.abort();
    };
  }, []);
  useEffect(() => {
    if (
      !enabled ||
      busy ||
      (job.current &&
        !tracks.some((track) => track.id === job.current!.id && track.blob === job.current!.blob))
    )
      job.current?.controller.abort();
  }, [enabled, busy, tracks]);
  useEffect(() => {
    if (!enabled || busy || !supported || job.current) return;
    const pending = tracks.filter(
      (track) =>
        track.blob &&
        (track.id === requested || needsMeasurement(track, measuredInSession)) &&
        !failed.has(track.id) &&
        track.duration > 0 &&
        track.duration <= 600 &&
        track.blob.size <= 48 * 1024 * 1024,
    );
    const next =
      pending.find((track) => track.id === requested) ??
      pending.find((track) => track.id === priority) ??
      pending[0];
    if (!next?.blob) return;
    const work = { controller: new AbortController(), id: next.id, blob: next.blob };
    job.current = work;
    void measureVolume(next.blob, next.duration, work.controller.signal)
      .then(async (fix) => {
        if (
          !work.controller.signal.aborted &&
          latest.current.tracks.some((track) => track.id === next.id && track.blob === work.blob)
        ) {
          setMeasuredInSession((previous) => new Set(previous).add(next.id));
          setRequested((current) => (current === next.id ? null : current));
          await latest.current.onSave(next.id, fix);
        }
      })
      .catch(() => {
        if (!work.controller.signal.aborted)
          setFailed((previous) => new Set(previous).add(next.id));
      })
      .finally(() => {
        if (job.current === work) job.current = null;
        if (mounted.current) refresh((value) => value + 1);
      });
  }, [
    tracks,
    enabled,
    busy,
    supported,
    onSave,
    priority,
    revision,
    failed,
    measuredInSession,
    requested,
  ]);

  const requestTrack = useCallback(
    (id: string) => {
      if (!enabled) return;
      setFailed((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
      setMeasuredInSession((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
      setRequested(id);
      if (job.current && job.current.id !== id) job.current.controller.abort();
      refresh((value) => value + 1);
    },
    [enabled],
  );

  const local = tracks.filter((track) => track.blob);
  const readyTracks = local.filter((track) => !needsMeasurement(track, measuredInSession));
  const ready = readyTracks.length;
  const adjusted = readyTracks.filter(
    (track) =>
      track.volumeFix && (track.volumeFix.applied ?? Math.abs(track.volumeFix.gain - 1) >= 0.03),
  ).length;
  const untouched = ready - adjusted;
  const skipped = local.filter(
    (track) =>
      needsMeasurement(track, measuredInSession) &&
      (failed.has(track.id) ||
        !Number.isFinite(track.duration) ||
        track.duration <= 0 ||
        track.duration > 600 ||
        track.blob!.size > 48 * 1024 * 1024),
  ).length;
  const pending = local.length - ready - skipped;
  return {
    supported,
    requestTrack,
    ready,
    adjusted,
    untouched,
    total: local.length,
    skipped,
    pending,
    working: enabled && !busy && supported && pending > 0,
  };
}
