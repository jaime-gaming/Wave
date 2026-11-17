import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  countsAsPlay,
  listeningSummary,
  makePlay,
  monthlyRecaps,
  weeklyRecap,
  weeklyRecaps,
  yearlyRecaps,
  type PlayEvent,
} from '../domain/listening';
import type { ListeningSignal } from '../domain/mood';
import type { Track } from '../domain/types';
import { clearPlays, getPlays, savePlay } from '../data/listening';

/** How often the listened seconds are sampled while a song plays. */
const SAMPLE_MS = 1_000;
/** A jump bigger than this is a seek or a stall, not listening. */
const MAX_STEP_SECONDS = 2.5;
/** Dwell checkpoints that update the automatic listening mood without ticking every second. */
const MOOD_DWELL_STAGES = [15, 30, 75];

interface Session {
  trackId: string;
  startedAt: number;
  seconds: number;
  /** Duration belongs to this playback, even if the next song is shorter. */
  duration: number;
  /** Last position read from the player, so a seek does not count as listening. */
  last: number | null;
  completed: boolean;
  /** Last dwell milestone already emitted to mood detection. */
  moodStage: number;
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
  /** Short-term behavioral cues (active dwell milestones + quick skips) for live mood detection. */
  const [liveSignals, setLiveSignals] = useState<ListeningSignal[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** The summary is dated when the rows change, not on every render. */
  const [today, setToday] = useState(() => new Date().setHours(0, 0, 0, 0));
  const session = useRef<Session | null>(null);
  const readTimeRef = useRef(readTime);
  useEffect(() => {
    readTimeRef.current = readTime;
  }, [readTime]);
  useEffect(() => {
    const current = session.current;
    if (current && current.trackId === track?.id && Number.isFinite(duration) && duration > 0) {
      current.duration = duration;
    }
  }, [duration, track?.id]);

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

  /** Writes the session if it deserves a row, and records behavioral dwell/skip mood cues. */
  const settle = useCallback((current: Session | null) => {
    if (!current) return;
    const heard = Math.round(current.seconds);
    if (heard >= 2) {
      const cue: ListeningSignal = {
        trackId: current.trackId,
        seconds: heard,
        duration: current.duration,
        completed: current.completed,
        at: current.startedAt,
      };
      setLiveSignals((existing) => [
        ...existing.filter((item) => item.at !== cue.at || item.trackId !== cue.trackId).slice(-14),
        cue,
      ]);
    }
    if (!countsAsPlay(current.seconds, current.duration)) return;
    const play = makePlay(current.trackId, current.startedAt, heard, current.completed);
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
        duration: track.duration,
        // Capture the starting position now, so the first second of real
        // playback is counted. A seek is still rejected by the step bound.
        last: Number.isFinite(initial) && initial >= 0 ? initial : null,
        completed: false,
        moodStage: 0,
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
      const length = current.duration || track.duration || 0;
      if (length > 0 && position >= length - 1) current.completed = true;

      // Update live mood signal at deliberate dwell milestones (15s, 30s, 75s)
      // so mood responds once the listener actually stays with a song.
      const nextThreshold = MOOD_DWELL_STAGES[current.moodStage];
      if (nextThreshold !== undefined && current.seconds >= nextThreshold) {
        current.moodStage++;
        const cue: ListeningSignal = {
          trackId: current.trackId,
          seconds: Math.round(current.seconds),
          duration: length,
          completed: current.completed,
          at: current.startedAt,
        };
        setLiveSignals((existing) => [
          ...existing
            .filter((item) => item.at !== cue.at || item.trackId !== cue.trackId)
            .slice(-14),
          cue,
        ]);
      }
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [playing, track]);

  const forget = useCallback(async () => {
    session.current = null;
    setPlays([]);
    setLiveSignals([]);
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
  // Up to a year, newest first: Remix keeps the weeks before this one instead of
  // forgetting them every Monday.
  const history = useMemo(
    () => weeklyRecaps(plays, tracks, Math.max(today, 0), 52),
    [plays, tracks, today],
  );
  const monthlyHistory = useMemo(
    () => monthlyRecaps(plays, tracks, Math.max(today, 0), 12),
    [plays, tracks, today],
  );
  const yearlyHistory = useMemo(
    () => yearlyRecaps(plays, tracks, Math.max(today, 0)),
    [plays, tracks, today],
  );
  const moodSignals = useMemo<ListeningSignal[]>(() => {
    const byId = new Map(tracks.map((item) => [item.id, item]));
    const persisted = plays.slice(-16).map((play) => ({
      trackId: play.trackId,
      seconds: play.seconds,
      duration: byId.get(play.trackId)?.duration,
      completed: play.completed,
      at: play.at,
    }));
    const merged = new Map<string, ListeningSignal>();
    for (const sig of [...persisted, ...liveSignals]) {
      merged.set(`${sig.trackId}:${sig.at ?? 0}`, sig);
    }
    return [...merged.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-16);
  }, [plays, liveSignals, tracks]);
  return {
    plays,
    summary,
    recap,
    history,
    monthlyHistory,
    yearlyHistory,
    moodSignals,
    loaded,
    forget,
  };
}
