import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  countsAsPlay,
  listeningSummary,
  makePlay,
  weeklyRecap,
  type PlayEvent,
} from '../domain/listening';
import type { Track } from '../domain/types';
import { clearPlays, getPlays, savePlay } from '../data/listening';

/** How often the listened seconds are sampled while a song plays. */
const SAMPLE_MS = 1_000;
/** A jump bigger than this is a seek or a stall, not listening. */
const MAX_STEP_SECONDS = 2.5;

interface Session {
  trackId: string;
  startedAt: number;
  seconds: number;
  /** Last position read from the player, so a seek does not count as listening. */
  last: number | null;
  completed: boolean;
}

/**
 * Records what was actually listened to.
 *
 * The song's own clock is the source: every second the position is sampled and
 * the difference is added, which means pausing, buffering and seeking do not
 * inflate the total the way a wall-clock timer would. The play is written once,
 * when it has passed the threshold in `domain/listening`, so skipping through a
 * queue leaves no trace behind it.
 *
 * Nothing is stored for a song that never got that far, and the history is only
 * ever appended to here. Reading it back is the summary below, computed from the
 * same rows the page displays.
 */
export function useListeningHistory({
  track,
  playing,
  duration,
  readTime,
  tracks,
}: {
  track?: Track;
  playing: boolean;
  duration: number;
  readTime: () => number;
  tracks: Track[];
}) {
  const [plays, setPlays] = useState<PlayEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** The summary is dated when the rows change, not on every render. */
  const [today, setToday] = useState(() => new Date().setHours(0, 0, 0, 0));
  const session = useRef<Session | null>(null);
  const readTimeRef = useRef(readTime);
  const durationRef = useRef(duration);
  useEffect(() => {
    readTimeRef.current = readTime;
  }, [readTime]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    let active = true;
    void getPlays()
      .then((stored) => {
        if (active) setPlays(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /** Writes the session if it deserves a row, and forgets it either way. */
  const settle = useCallback((current: Session | null) => {
    if (!current) return;
    if (!countsAsPlay(current.seconds, durationRef.current)) return;
    const play = makePlay(
      current.trackId,
      current.startedAt,
      Math.round(current.seconds),
      current.completed,
    );
    setPlays((existing) =>
      existing.some((entry) => entry.id === play.id) ? existing : [...existing, play],
    );
    void savePlay(play).catch(() => undefined);
  }, []);

  // A new song, a pause or the end of the recording all close the session.
  useEffect(() => {
    const previous = session.current;
    if (previous && (!playing || previous.trackId !== track?.id)) settle(previous);
    if (!playing || !track) {
      session.current = null;
      return;
    }
    if (!previous || previous.trackId !== track.id) {
      const initial = readTimeRef.current();
      session.current = {
        trackId: track.id,
        startedAt: Date.now(),
        seconds: 0,
        // Capture the starting position now, so the first second of real
        // playback is counted. A seek is still rejected by the step bound.
        last: Number.isFinite(initial) && initial >= 0 ? initial : null,
        completed: false,
      };
    }
  }, [playing, track, settle]);

  // Sampling stops when nothing is playing, so a paused tab costs nothing.
  useEffect(() => {
    if (!playing || !track) return;
    const timer = setInterval(() => {
      const current = session.current;
      if (!current) return;
      const position = readTimeRef.current();
      if (!Number.isFinite(position) || position < 0) return;
      if (current.last !== null) {
        const step = position - current.last;
        if (step > 0 && step <= MAX_STEP_SECONDS) current.seconds += step;
      }
      current.last = position;
      // Within a second of the end is the end: the song played through, and
      // that is what separates it from one that was skipped away.
      const length = durationRef.current || track.duration || 0;
      if (length > 0 && position >= length - 1) current.completed = true;
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [playing, track]);

  const forget = useCallback(async () => {
    session.current = null;
    setPlays([]);
    await clearPlays().catch(() => undefined);
  }, []);

  useEffect(() => {
    // A page left open overnight would otherwise keep yesterday's "this week".
    const timer = setInterval(() => setToday(new Date().setHours(0, 0, 0, 0)), 60_000);
    return () => clearInterval(timer);
  }, []);
  const summary = useMemo(
    () => listeningSummary(plays, tracks, Math.max(today, 0)),
    [plays, tracks, today],
  );
  // The week and its Remix list are built here, where both the plays and the
  // library are at hand, and dated like the summary.
  const recap = useMemo(
    () => weeklyRecap(plays, tracks, Math.max(today, 0)),
    [plays, tracks, today],
  );
  return { plays, summary, recap, loaded, forget };
}
