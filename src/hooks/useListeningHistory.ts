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

const SAMPLE_MS = 1_000;

const MAX_STEP_SECONDS = 2.5;

const MOOD_DWELL_STAGES = [15, 30, 75];

interface Session {
  trackId: string;
  startedAt: number;
  seconds: number;

  duration: number;

  last: number | null;
  completed: boolean;

  moodStage: number;
}

export function useListeningHistory({
  track,
  playing,
  duration,
  readTime,
  tracks,
  repeatSerial = 0,
}: {
  track?: Track;
  playing: boolean;
  duration: number;
  readTime: () => number;
  tracks: Track[];
  repeatSerial?: number;
}) {
  const [plays, setPlays] = useState<PlayEvent[]>([]);

  const [liveSignals, setLiveSignals] = useState<ListeningSignal[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [today, setToday] = useState(() => new Date().setHours(0, 0, 0, 0));
  const session = useRef<Session | null>(null);
  const sessionSerial = useRef(repeatSerial);
  const writes = useRef<Promise<void>>(Promise.resolve());
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
    setPlays((existing) => [...existing.filter((entry) => entry.id !== play.id), play]);
    writes.current = writes.current.then(() => savePlay(play)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const previous = session.current;
    const changed =
      previous && (previous.trackId !== track?.id || sessionSerial.current !== repeatSerial);
    if (changed) {
      settle(previous);
      session.current = null;
    }
    sessionSerial.current = repeatSerial;
    if (!track) return;
    if (!playing) {
      if (session.current) {
        settle(session.current);
        session.current.last = null;
      }
      return;
    }
    if (!session.current) {
      const initial = readTimeRef.current();
      session.current = {
        trackId: track.id,
        startedAt: Math.max(Date.now(), (previous?.startedAt ?? 0) + 1),
        seconds: 0,
        duration: track.duration,
        last: Number.isFinite(initial) && initial >= 0 ? initial : null,
        completed: false,
        moodStage: 0,
      };
    } else if (session.current.last === null) {
      const initial = readTimeRef.current();
      session.current.last = Number.isFinite(initial) && initial >= 0 ? initial : null;
    }
  }, [playing, track, repeatSerial, settle]);

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

      const length = current.duration || track.duration || 0;
      if (length > 0 && position >= length - 1) current.completed = true;

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
    await writes.current;
    await clearPlays().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setToday(new Date().setHours(0, 0, 0, 0)), 60_000);
    return () => clearInterval(timer);
  }, []);
  const summary = useMemo(
    () => listeningSummary(plays, tracks, Math.max(today, 0)),
    [plays, tracks, today],
  );

  const recap = useMemo(
    () => weeklyRecap(plays, tracks, Math.max(today, 0)),
    [plays, tracks, today],
  );

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

    const recentPersisted = plays.slice(-48);
    const persisted = recentPersisted.map((play, idx) => ({
      trackId: play.trackId,
      seconds: play.seconds,
      duration: byId.get(play.trackId)?.duration,
      completed: play.completed,
      replayed: idx > 0 && recentPersisted[idx - 1].trackId === play.trackId,
      at: play.at,
    }));
    const merged = new Map<string, ListeningSignal>();
    for (const sig of [...persisted, ...liveSignals]) {
      merged.set(`${sig.trackId}:${sig.at ?? 0}`, sig);
    }
    return [...merged.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-48);
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
