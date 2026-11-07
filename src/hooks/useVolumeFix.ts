import { useEffect, useRef, useState } from 'react';
import { measureVolume, type VolumeFix } from '../audio/volumeFix';
import type { Track } from '../domain/types';

/** One local scan at a time, owned by the app rather than the Settings page. */
export function useVolumeFix(
  tracks: Track[],
  enabled: boolean,
  busy: boolean,
  onSave: (id: string, fix: VolumeFix) => Promise<void>,
  priority?: string,
) {
  const [revision, refresh] = useState(0);
  const latest = useRef({ tracks, onSave });
  const [failed, setFailed] = useState(() => new Set<string>());
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
        !track.volumeFix &&
        !failed.has(track.id) &&
        track.duration > 0 &&
        track.duration <= 600 &&
        track.blob.size <= 48 * 1024 * 1024,
    );
    const next = pending.find((track) => track.id === priority) ?? pending[0];
    if (!next?.blob) return;
    const work = { controller: new AbortController(), id: next.id, blob: next.blob };
    job.current = work;
    void measureVolume(next.blob, next.duration, work.controller.signal)
      .then(async (fix) => {
        if (
          !work.controller.signal.aborted &&
          latest.current.tracks.some((track) => track.id === next.id && track.blob === work.blob)
        )
          await latest.current.onSave(next.id, fix);
      })
      .catch(() => {
        if (!work.controller.signal.aborted)
          setFailed((previous) => new Set(previous).add(next.id));
      })
      .finally(() => {
        if (job.current === work) job.current = null;
        if (mounted.current) refresh((value) => value + 1);
      });
  }, [tracks, enabled, busy, supported, onSave, priority, revision, failed]);
  const local = tracks.filter((track) => track.blob);
  const ready = local.filter((track) => track.volumeFix).length;
  const skipped = local.filter(
    (track) =>
      !track.volumeFix &&
      (failed.has(track.id) ||
        !Number.isFinite(track.duration) ||
        track.duration <= 0 ||
        track.duration > 600 ||
        track.blob!.size > 48 * 1024 * 1024),
  ).length;
  const pending = local.length - ready - skipped;
  return {
    supported,
    ready,
    total: local.length,
    skipped,
    pending,
    working: enabled && !busy && supported && pending > 0,
  };
}
