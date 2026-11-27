import { automaticMixSeconds, mixWindowReached, plannedMixWindow } from '../domain/mix';
import {
  alignIncomingLyrics,
  isUsablePlan,
  planTransitionCached,
  realignPlan,
  type TransitionPlan,
} from '../domain/mixPlanner';
import type { EndingShape } from '../domain/mixEnding';
import { analyzeTrack, cachedAnalysis } from '../audio/mixAnalysis';
import { continuationQueue } from '../domain/continuation';
import type { ListeningSignal } from '../domain/mood';
import {
  readPlaybackSession,
  readResumeOnReload,
  writePlaybackSession,
  writeResumeOnReload,
} from '../domain/playbackSession';
import { MixAudio } from '../audio/MixAudio';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useOnline } from '../ui/network';
import { isYouTubeTrack } from '../domain/youtubeTrack';
import { playerReducer, shuffleQueue } from '../domain/player';
import { resolvePlayable } from '../domain/youtubeTrack';
import { silenceReport, trimFromReport, type SilenceReport } from '../domain/silence';
import { breakDue, freshBreak, heardFor, nextBreakThreshold } from '../domain/breakTime';
import { PlaybackClock } from './playbackClock';
import { cueTiming, MixCueStore } from '../ui/mixCue';
import type { Track } from '../domain/types';
import type { TrackAnalysis } from '../audio/dsp';

function savedVolume(key = 'wave-volume') {
  try {
    const value = localStorage.getItem(key);
    const parsed = Number(value);
    return value !== null && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
  } catch {
    return 1;
  }
}
function savedMix() {
  try {
    const value = localStorage.getItem('wave-mix-v2');
    if (value !== null) return value === 'true';
    const legacy = localStorage.getItem('wave-crossfade');
    return legacy === null ? true : Number(legacy) > 0;
  } catch {
    return true;
  }
}
function savedAutoplay() {
  try {
    return localStorage.getItem('wave-autoplay') !== 'false';
  } catch {
    return true;
  }
}

export interface SilenceStore {
  record: (id: string, bounds: { start: number; end: number }) => void;

  trim: (id: string, bounds: { start: number; end: number }) => void;

  keep: (id: string) => void;
}

export function usePlayer(
  tracks: Track[],
  libraryReady = true,
  silenceStore?: SilenceStore,
  volumeFixEnabled = false,
) {
  const [saved] = useState(readPlaybackSession);
  const [repeatSerial, setRepeatSerial] = useState(0);
  const [mixEnabled, setMixEnabled] = useState(savedMix);
  const [autoplay, setAutoplay] = useState(savedAutoplay);
  const [resumeOnReload, setResumeOnReloadState] = useState(readResumeOnReload);
  const setResumeOnReload = useCallback((enabled: boolean) => {
    setResumeOnReloadState(enabled);
    writeResumeOnReload(enabled);
  }, []);

  const autoResumeHandled = useRef(!saved.wasPlaying || !readResumeOnReload());

  const recent = useRef<string[]>([]);
  const moodSignalsRef = useRef<ListeningSignal[] | undefined>(undefined);
  const setMoodSignals = useCallback((signals: ListeningSignal[]) => {
    moodSignalsRef.current = signals;
  }, []);
  const positions = useRef(saved.positions);
  const resumeId = useRef<string | undefined>(saved.state.queue[saved.state.index]);
  const readyRef = useRef(libraryReady);
  const [state, dispatch] = useReducer(playerReducer, saved.state);
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const trackByBlob = useMemo(() => {
    const map = new Map<Blob, Track>();
    for (const track of tracks) if (track.blob) map.set(track.blob, track);
    return map;
  }, [tracks]);

  const [clock] = useState(() => new PlaybackClock());

  const [mixCue] = useState(() => new MixCueStore());

  const blendRef = useRef<{
    outgoing: Blob;
    incoming: Blob;
    progress: number;
    seconds: number;
  } | null>(null);
  const [blend, setBlend] = useState<{
    outgoing: Blob;
    incoming: Blob;
    progress: number;
    seconds: number;
  } | null>(null);

  const mixDecision = useRef<{
    outgoing?: Blob;
    incoming?: Blob;
    outgoingAnalysis?: TrackAnalysis;
    incomingAnalysis?: TrackAnalysis;
    duration: number;
    preparedDuration: number;
    fallback: number;
    lyrics?: unknown;
    ending: EndingShape;
    plan?: TransitionPlan;
    window: number;
    blendWindow: number;
  } | null>(null);
  const [duration, setDuration] = useState(0);
  const [durationTrackId, setDurationTrackId] = useState<string>();
  const [volume, updateVolume] = useState(() => savedVolume());

  const [youTubeClock, setYouTubeClock] = useState<{
    id?: string;
    time: number;
    duration: number;
  }>({ time: 0, duration: 0 });
  const [youTubeSeek, setYouTubeSeek] = useState({ seconds: 0, nonce: 0 });
  const lastAudible = useRef(volume || savedVolume('wave-last-audible-volume') || 1);
  const online = useOnline();
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');
  const engine = useRef<MixAudio | null>(null);
  const context = useRef({ tracks, trackById, trackByBlob, mixEnabled, autoplay, online });
  const stateRef = useRef(state);
  const current = trackById.get(state.queue[state.index]);

  const playable = resolvePlayable(current, tracks);
  const youTube = !!playable?.fromYouTube;
  const blob = playable?.track.blob;

  const missingAudio = !!current && !blob && !youTube;
  const youTubeTime = youTubeClock.id === current?.id ? youTubeClock.time : 0;
  const youTubeDuration = youTubeClock.id === current?.id ? youTubeClock.duration : 0;

  const youTubeRef = useRef(youTube);
  const youTubeTimeRef = useRef(youTubeTime);
  const currentIdRef = useRef(current?.id);
  useEffect(() => {
    youTubeRef.current = youTube;
    youTubeTimeRef.current = youTubeTime;
    currentIdRef.current = current?.id;
  }, [youTube, youTubeTime, youTubeDuration, current?.id]);

  const prime = useCallback(
    (blob: Blob | undefined) => {
      if (!blob) return;
      const note = (analysis: Parameters<typeof silenceReport>[0]) => {
        if (!silenceStore) return;
        const track = context.current.trackByBlob.get(blob);
        if (!track || track.trim || track.silenceKept || track.silence) return;
        const report = silenceReport(analysis);
        if (!report?.worth) return;
        silenceStore.record(track.id, { start: report.start, end: report.end });
      };
      const cached = cachedAnalysis(blob);
      if (cached) {
        engine.current?.setAnalysis(blob, cached);
        note(cached);
        return;
      }
      void analyzeTrack(blob).then((analysis) => {
        if (!analysis) return;
        engine.current?.setAnalysis(blob, analysis);
        note(analysis);
      });
    },
    [silenceStore],
  );

  useEffect(() => {
    readyRef.current = libraryReady;
    if (!libraryReady) return;
    const ids = new Set(tracks.map((track) => track.id));
    const queue = state.queue.filter((id) => ids.has(id));
    if (queue.length !== state.queue.length)
      dispatch({
        type: 'reconcile',
        state: {
          ...state,
          queue,
          orderedQueue: state.orderedQueue.filter((id) => ids.has(id)),
          index: queue.length
            ? queue.includes(state.queue[state.index])
              ? queue.indexOf(state.queue[state.index])
              : Math.min(state.index, queue.length - 1)
            : -1,
          playing: queue.length ? state.playing : false,
        },
      });
  }, [libraryReady, tracks, state]);
  useEffect(() => {
    stateRef.current = state;
    context.current = { tracks, trackById, trackByBlob, mixEnabled, autoplay, online };
  }, [state, tracks, trackById, trackByBlob, mixEnabled, autoplay, online]);

  useEffect(() => {
    if (online || !youTube || !state.playing) return;
    const nextLocal = state.queue.slice(state.index + 1).find((id) => {
      const candidate = trackById.get(id);
      return candidate && !isYouTubeTrack(candidate);
    });
    if (nextLocal) {
      dispatch({ type: 'jump', id: nextLocal });
    } else {
      dispatch({ type: 'pause' });
    }
  }, [online, youTube, state.playing, state.queue, state.index, trackById]);

  useEffect(() => {
    if (!libraryReady || autoResumeHandled.current || !current) return;
    if (!resumeOnReload) {
      autoResumeHandled.current = true;
      return;
    }
    autoResumeHandled.current = true;
    if (!stateRef.current.playing) {
      dispatch({ type: 'toggle' });
    }
  }, [libraryReady, current, resumeOnReload]);
  useEffect(() => {
    try {
      localStorage.setItem('wave-mix-v2', String(mixEnabled));
      localStorage.setItem('wave-autoplay', String(autoplay));
    } catch {}
    if (!mixEnabled) {
      engine.current?.cancelTransition();
      engine.current?.prepare();
      mixCue.clear();
    }
    engine.current?.setMixEnabled(mixEnabled);
  }, [mixEnabled, autoplay, mixCue]);
  useEffect(() => {
    prime(current?.blob);

    const nextIdx =
      state.index + 1 < state.queue.length
        ? state.index + 1
        : state.repeat === 'all' && state.queue.length > 1
          ? 0
          : -1;
    const nextRow = nextIdx >= 0 ? trackById.get(state.queue[nextIdx]) : undefined;
    const nextPlayable = resolvePlayable(nextRow, tracks);
    if (nextPlayable?.track.blob) prime(nextPlayable.track.blob);
  }, [current?.blob, state.index, state.queue, state.repeat, trackById, tracks, prime]);
  useEffect(() => {
    if (current?.id && recent.current.at(-1) !== current.id)
      recent.current = [...recent.current.slice(-31), current.id];
  }, [current?.id]);
  const flushSession = useCallback(() => {
    if (!readyRef.current) return;
    const deck = engine.current?.active;
    const track = deck?.blob ? context.current.trackByBlob.get(deck.blob) : undefined;
    if (track && track.id !== resumeId.current && deck && Number.isFinite(deck.element.currentTime))
      positions.current[track.id] = deck.element.currentTime;
    writePlaybackSession(stateRef.current, positions.current);
  }, []);
  useEffect(() => {
    if (libraryReady) flushSession();
  }, [state, libraryReady, flushSession]);
  useEffect(() => {
    const interval = setInterval(flushSession, 1000);
    const hide = () => {
      if (document.visibilityState === 'hidden') flushSession();
    };
    window.addEventListener('pagehide', flushSession);
    window.addEventListener('beforeunload', flushSession);
    document.addEventListener('visibilitychange', hide);
    return () => {
      flushSession();
      clearInterval(interval);
      window.removeEventListener('pagehide', flushSession);
      window.removeEventListener('beforeunload', flushSession);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [flushSession]);
  useEffect(() => {
    const extend = (advance = false) => {
      const latest = stateRef.current,
        ctx = context.current;
      if (
        !ctx.autoplay ||
        !latest.playing ||
        latest.repeat !== 'off' ||
        latest.index !== latest.queue.length - 1
      )
        return false;
      const current = ctx.trackById.get(latest.queue[latest.index]);
      if (!current) return false;
      const ids = continuationQueue(
        ctx.tracks,
        current,
        [
          ...(moodSignalsRef.current ?? []).map((signal) => signal.trackId),
          ...latest.queue,
          ...recent.current,
        ],
        Math.random,
        12,
        (track) => cachedAnalysis(track.blob),
        moodSignalsRef.current,
        ctx.online,
      );
      if (!ids.length) return false;
      dispatch({ type: 'continue', ids, advance });
      return true;
    };
    const target = () => {
      const latest = stateRef.current;
      if (
        !latest.playing ||
        latest.repeat === 'one' ||
        latest.queue.length < 2 ||
        !context.current.mixEnabled
      )
        return;
      const index =
        latest.index + 1 < latest.queue.length
          ? latest.index + 1
          : latest.repeat === 'all'
            ? 0
            : -1;
      return context.current.trackById.get(latest.queue[index]);
    };
    const player = new MixAudio({
      time: (value) => clock.set(value),

      blend: (next) => {
        blendRef.current = next;
        setBlend((previous) =>
          !next || !previous || Math.abs(next.progress - previous.progress) >= 0.02
            ? next
            : previous,
        );
      },

      duration: (seconds) => {
        setDuration((previous) => (previous === seconds ? previous : seconds));
        const id = player.active.blob
          ? context.current.trackByBlob.get(player.active.blob)?.id
          : undefined;
        setDurationTrackId((previous) => (previous === id ? previous : id));
      },
      buffering: setBuffering,
      error: (message) => {
        setError(message);
        dispatch({ type: 'pause' });
      },
      warning: setError,
      reset: () => setError(''),
      ended: () => {
        const latest = stateRef.current;
        if (!latest.playing) return;
        if (latest.repeat === 'one' || (latest.repeat === 'all' && latest.queue.length === 1)) {
          const id = latest.queue[latest.index];
          void player
            .restart()
            .then(() => {
              if (stateRef.current.queue[stateRef.current.index] === id && stateRef.current.playing)
                setRepeatSerial((value) => value + 1);
            })
            .catch((reason: unknown) => {
              if (
                (reason instanceof DOMException && reason.name === 'AbortError') ||
                stateRef.current.queue[stateRef.current.index] !== id ||
                !stateRef.current.playing
              )
                return;
              setError('Playback could not restart. Press play to try again.');
              dispatch({ type: 'pause' });
            });
        } else if (!extend(true)) dispatch({ type: 'ended' });
      },
      tick: () => {
        extend();
        const latest = stateRef.current;
        const repeatRow = context.current.trackById.get(latest.queue[latest.index]);
        const repeatPlayable = resolvePlayable(repeatRow, context.current.tracks);
        const repeatTrack =
          repeatRow && repeatPlayable
            ? { ...repeatRow, blob: repeatPlayable.track.blob }
            : repeatRow;
        const singleRepeat =
          latest.repeat === 'one' || (latest.repeat === 'all' && latest.queue.length === 1);
        if (singleRepeat && repeatTrack?.blob && latest.playing) {
          if (!player.transitioning && player.mixRemaining <= 8) player.prepare(repeatTrack.blob);
          if (!player.transitioning && player.mixRemaining > 0 && player.mixRemaining <= 0.85) {
            const id = repeatTrack.id;
            player.repeatTransition(
              () => {
                const state = stateRef.current;
                return (
                  state.playing &&
                  state.queue[state.index] === id &&
                  (state.repeat === 'one' || (state.repeat === 'all' && state.queue.length === 1))
                );
              },
              () => setRepeatSerial((value) => value + 1),
            );
          }
          mixCue.clear();
          return;
        }
        const nextRow = target();
        const nextPlayable = resolvePlayable(nextRow, context.current.tracks);
        const next =
          nextRow && nextPlayable ? { ...nextRow, blob: nextPlayable.track.blob } : nextRow;
        const element = player.element;
        const duration = element.duration;
        const remaining = player.mixRemaining;
        const hasClock = Number.isFinite(duration) && duration > 0;

        const window = hasClock
          ? automaticMixSeconds(duration, player.preparedDuration || next?.duration || 0)
          : 0;
        const outgoingAnalysis = cachedAnalysis(player.active.blob);
        const incomingAnalysis = next?.blob ? cachedAnalysis(next.blob) : undefined;
        const ending = player.endingFor(player.active.blob);
        const preparedDuration = player.preparedDuration || next?.duration || 0;
        const cached = mixDecision.current;
        const decision =
          cached &&
          cached.outgoing === player.active.blob &&
          cached.incoming === next?.blob &&
          cached.outgoingAnalysis === outgoingAnalysis &&
          cached.incomingAnalysis === incomingAnalysis &&
          cached.duration === duration &&
          cached.preparedDuration === preparedDuration &&
          cached.fallback === window &&
          cached.lyrics === next?.lyrics &&
          cached.ending === ending
            ? cached
            : (() => {
                const outgoingPlan =
                  outgoingAnalysis && incomingAnalysis
                    ? alignIncomingLyrics(
                        planTransitionCached(outgoingAnalysis, incomingAnalysis, {
                          fallbackSeconds: window,
                          ending,
                        }),
                        next?.lyrics,
                        incomingAnalysis.trimmed.start,
                      )
                    : undefined;
                const built = {
                  outgoing: player.active.blob,
                  incoming: next?.blob,
                  outgoingAnalysis,
                  incomingAnalysis,
                  duration,
                  preparedDuration,
                  fallback: window,
                  lyrics: next?.lyrics,
                  ending,
                  plan: outgoingPlan,
                  window,
                  blendWindow: Math.max(window, outgoingPlan?.seconds ?? 0),
                };
                mixDecision.current = built;
                return built;
              })();
        const plan = decision.plan;

        const playbackEnd = element.currentTime + remaining;
        const blendWindow = plannedMixWindow(decision.blendWindow, playbackEnd, plan?.startAt);
        const cueTrack = stateRef.current.queue.length
          ? context.current.trackById.get(stateRef.current.queue[stateRef.current.index])
          : undefined;
        const live = blendRef.current;
        if (player.transitioning) {
          const fromTrack = live ? context.current.trackByBlob.get(live.outgoing) : cueTrack;
          const toTrack = live ? context.current.trackByBlob.get(live.incoming) : next;
          if (fromTrack && toTrack && fromTrack.id !== toTrack.id)
            mixCue.set({ from: fromTrack, to: toTrack, seconds: 0, progress: 1 });
          else mixCue.clear();
        } else if (context.current.mixEnabled && next?.blob && cueTrack && hasClock) {
          const timing = cueTiming(remaining, blendWindow);
          if (timing) mixCue.set({ from: cueTrack, to: next, ...timing });
          else mixCue.clear();
        } else mixCue.clear();

        if (next?.blob && player.mixRemaining <= 45) player.prepare(next.blob);
        if (next?.blob) prime(next.blob);
        if (player.mixRemaining <= 10 && !player.transitioning && extend()) return;
        if (!next?.blob) return;
        if (!hasClock || remaining <= 0) return;
        const from = stateRef.current.queue[stateRef.current.index];
        const stillTarget = () => {
          if (stateRef.current.queue[stateRef.current.index] !== from) return false;
          const latest = target();
          const playable = resolvePlayable(latest, context.current.tracks);
          return !!latest && latest.id === next.id && playable?.track.blob === next.blob;
        };
        const onStarted = () => dispatch({ type: 'jump', id: next.id });

        if (!mixWindowReached(element.currentTime, playbackEnd, blendWindow)) return;

        const incomingStart = next.trim?.start ?? 0;
        const incomingEnd = Math.min(preparedDuration || Infinity, next.trim?.end || Infinity);
        const usablePlan =
          plan &&
          plan.startAt < playbackEnd &&
          plan.cue >= incomingStart &&
          plan.cue + 0.5 < incomingEnd &&
          isUsablePlan(plan, remaining)
            ? plan
            : undefined;
        if (usablePlan) {
          if (element.currentTime >= usablePlan.startAt) {
            const aligned = realignPlan(usablePlan, element.currentTime);
            if (aligned && aligned.startAt > element.currentTime + 0.02) return;
            if (aligned) {
              const late = Math.max(0, element.currentTime - aligned.startAt);
              player.transitionWithPlan(
                next.blob,
                { ...aligned, cue: aligned.cue + late, seconds: aligned.seconds - late },
                stillTarget,
                onStarted,
              );
              return;
            }
          } else if (remaining > 1.2) {
            return;
          }
        }

        if (remaining <= window) player.transition(next.blob, window, stillTarget, onStarted);
      },
    });
    engine.current = player;
    player.setMixEnabled(context.current.mixEnabled);

    return () => {
      mixCue.clear();
      player.destroy();
      engine.current = null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const outgoing = engine.current?.outgoingBlob;
    if (
      outgoing &&
      !state.queue.some((id) => resolvePlayable(trackById.get(id), tracks)?.track.blob === outgoing)
    )
      engine.current?.cancelTransition();
  }, [tracks, trackById, state.queue]);

  useEffect(() => {
    const player = engine.current;
    player?.load(blob);
    if (!player || !current?.id || resumeId.current !== current.id) return;
    const id = current.id;
    const element = player.element;
    const position = positions.current[id] ?? 0;
    const restore = () => {
      if (!Number.isFinite(player.element.duration) || player.element.duration <= 0) return;
      player.seek(Math.min(position, player.element.duration));
      clock.set(Math.min(position, player.element.duration), true);
      resumeId.current = undefined;
    };
    element.addEventListener('loadedmetadata', restore);
    restore();
    return () => element.removeEventListener('loadedmetadata', restore);
  }, [blob, current?.id, clock]);

  useEffect(() => {
    const resume = () => void engine.current?.resumeAudio();
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);
  useEffect(() => {
    const player = engine.current;
    if (!player || !blob) return;
    let active = true;
    let gestureUnlock: (() => void) | undefined;
    if (state.playing) {
      void player.play().catch((reason: unknown) => {
        if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setBuffering(false);
        if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
          dispatch({ type: 'pause' });
          const unlock = () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            gestureUnlock = undefined;
            if (!stateRef.current.playing && stateRef.current.queue.length) {
              dispatch({ type: 'toggle' });
            }
          };
          gestureUnlock = unlock;
          window.addEventListener('pointerdown', unlock, true);
          window.addEventListener('keydown', unlock, true);
          return;
        }
        setError('Playback could not start. Press play to try again or choose another track.');
        dispatch({ type: 'pause' });
      });
    } else player.pause();
    return () => {
      active = false;
      if (gestureUnlock) {
        window.removeEventListener('pointerdown', gestureUnlock, true);
        window.removeEventListener('keydown', gestureUnlock, true);
      }
    };
  }, [state.playing, blob]);
  useEffect(() => {
    engine.current?.setVolume(volume);
    try {
      localStorage.setItem('wave-volume', String(volume));
      if (volume > 0) localStorage.setItem('wave-last-audible-volume', String(volume));
    } catch {}
  }, [volume]);
  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(1, value));
    if (next > 0) lastAudible.current = next;
    updateVolume(next);
  }, []);
  const toggleMute = useCallback(
    () => updateVolume((value) => (value > 0 ? 0 : lastAudible.current)),
    [],
  );
  const seek = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      if (youTubeRef.current) {
        const next = Math.max(0, seconds);
        setYouTubeClock((value) => ({
          id: currentIdRef.current,
          time: next,
          duration: value.duration,
        }));
        setYouTubeSeek((value) => ({ seconds: next, nonce: value.nonce + 1 }));
        clock.set(next, true);
        return;
      }
      const player = engine.current;
      if (!player || !Number.isFinite(player.element.duration) || player.element.duration <= 0)
        return;
      const next = Math.max(0, Math.min(seconds, player.element.duration));
      player.seek(next);
      clock.set(next, true);
    },
    [clock],
  );
  const previous = useCallback(() => {
    const position = youTubeRef.current
      ? youTubeTimeRef.current
      : (engine.current?.element.currentTime ?? 0);
    if (position > 3) seek(0);
    else dispatch({ type: 'previous' });
  }, [seek]);
  const play = useCallback(
    (list: Track[], id: string) => {
      const requested = list.find((track) => track.id === id);
      if (!context.current.online && isYouTubeTrack(requested)) {
        setError('YouTube songs need an internet connection.');
        return;
      }
      resumeId.current = undefined;
      positions.current[id] = 0;
      if (stateRef.current.queue[stateRef.current.index] === id && engine.current) {
        if (youTubeRef.current) seek(0);
        else engine.current.seek(0);
      }
      dispatch({ type: 'load', queue: list.map((track) => track.id), id });
    },
    [seek],
  );
  const shuffle = useCallback(() => {
    const latest = stateRef.current;
    const queue = latest.shuffled
      ? latest.orderedQueue.filter((id) => latest.queue.includes(id))
      : shuffleQueue(latest.queue, latest.queue[latest.index]);
    dispatch({ type: 'shuffle', queue });
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata =
      current && 'MediaMetadata' in window
        ? new MediaMetadata({
            title: current.title,
            artist: current.artist,
            album: current.album,
            artwork: current.artwork ? [{ src: current.artwork }] : [],
          })
        : null;
    navigator.mediaSession.playbackState = !current ? 'none' : state.playing ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        'play',
        () => {
          if (!stateRef.current.playing) dispatch({ type: 'toggle' });
        },
      ],
      ['pause', () => dispatch({ type: 'pause' })],
      ['nexttrack', () => dispatch({ type: 'next' })],
      ['previoustrack', previous],
      [
        'seekto',
        (details) => {
          if (details.seekTime !== undefined) seek(details.seekTime);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [current, state.playing, previous, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const report = () => {
      try {
        if (duration > 0 && Number.isFinite(duration))
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: 1,
            position: Math.max(0, Math.min(clock.get(), duration)),
          });
        else navigator.mediaSession.setPositionState();
      } catch {}
    };
    report();

    const timer = setInterval(report, 1000);
    return () => clearInterval(timer);
  }, [clock, duration]);

  const enqueue = useCallback(
    (ids: string[]) =>
      dispatch({
        type: 'enqueue',
        ids: ids.filter((id) => context.current.tracks.some((track) => track.id === id)),
      }),
    [],
  );
  const readTime = useCallback(
    () =>
      youTubeRef.current ? youTubeTimeRef.current : (engine.current?.element.currentTime ?? 0),
    [],
  );

  const youTubeEnded = useCallback(() => {
    const latest = stateRef.current;
    if (!latest.playing) return;
    if (latest.repeat === 'one' || (latest.repeat === 'all' && latest.queue.length === 1)) {
      setRepeatSerial((value) => value + 1);
      setYouTubeSeek((value) => ({ seconds: 0, nonce: value.nonce + 1 }));
      return;
    }
    dispatch({ type: 'ended' });
  }, []);
  const showYouTubeError = useCallback((message: string) => setError(message), []);

  const reportYouTubeTime = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const value = Math.max(0, seconds);
      clock.set(value);
      setYouTubeClock((current) =>
        current.id === currentIdRef.current && Math.abs(current.time - value) < 1
          ? current
          : { id: currentIdRef.current, time: value, duration: current.duration },
      );
    },
    [clock],
  );
  const reportYouTubeDuration = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const id = currentIdRef.current;
    setYouTubeClock((value) => ({ id, time: value.id === id ? value.time : 0, duration: seconds }));
    if (id) {
      setDuration(seconds);
      setDurationTrackId(id);
    }
  }, []);
  const reorderQueue = useCallback((ids: string[]) => dispatch({ type: 'reorder', ids }), []);
  const readElement = useCallback(
    () => (youTubeRef.current ? undefined : engine.current?.element),
    [],
  );

  const [breakOpen, setBreakOpen] = useState(false);
  const listened = useRef(freshBreak());
  const breakThreshold = useRef(undefined as number | undefined);
  useEffect(() => {
    if (!state.playing) return;
    const timer = setInterval(() => {
      listened.current = heardFor(listened.current, 5);
      if (breakDue(listened.current, breakThreshold.current)) {
        if (stateRef.current.playing) dispatch({ type: 'pause' });
        setBreakOpen(true);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [state.playing]);
  const keepListening = useCallback(() => {
    breakThreshold.current = nextBreakThreshold(
      breakThreshold.current ?? listened.current.listened,
    );
    setBreakOpen(false);
    if (!stateRef.current.playing) dispatch({ type: 'toggle' });
  }, []);
  const stopForNow = useCallback(() => {
    breakThreshold.current = nextBreakThreshold(
      breakThreshold.current ?? listened.current.listened,
    );
    setBreakOpen(false);
  }, []);

  const silenceNotice: { text: string; report: SilenceReport } | null = (() => {
    if (!current?.silence || current.trim || current.silenceKept || !silenceStore) return null;
    const report = silenceReport({
      duration: current.duration || current.silence.end,
      trimmed: current.silence,
    });
    if (!report?.worth) return null;
    return { text: "We've detected silence in this track", report };
  })();

  const removeSilence = useCallback(() => {
    if (!current || !silenceNotice || !silenceStore) return;
    silenceStore.trim(current.id, trimFromReport(silenceNotice.report));
  }, [current, silenceNotice, silenceStore]);

  const keepSilence = useCallback(() => {
    if (!current || !silenceStore) return;
    silenceStore.keep(current.id);
  }, [current, silenceStore]);

  useEffect(() => {
    for (const track of tracks)
      if (track.blob) {
        engine.current?.setBounds(track.blob, track.trim);
        engine.current?.setVolumeFix(track.blob, volumeFixEnabled ? track.volumeFix?.gain : 1);
      }
  }, [tracks, volumeFixEnabled]);

  const prepareVolumeFix = useCallback(async () => {
    await engine.current?.prepareVolumeFix();
  }, []);
  const pauseForPreview = useCallback(() => {
    engine.current?.pause();
    dispatch({ type: 'pause' });
  }, []);
  return {
    pauseForPreview,
    breakOpen,
    repeatSerial,
    prepareVolumeFix,
    keepListening,
    stopForNow,
    silenceNotice,
    trimSilence: async (bounds: { start: number; end: number }) => {
      if (current && silenceStore) silenceStore.trim(current.id, bounds);
    },
    removeSilence,
    keepSilence,
    mixCue,
    mixEnabled,
    setMixEnabled,
    setMoodSignals,
    autoplay,
    setAutoplay,
    resumeOnReload,
    setResumeOnReload,
    reorderQueue,
    readElement,
    readTime,
    durationTrackId,
    enqueue,
    blend:
      blend && blend.incoming !== blend.outgoing
        ? {
            ...blend,
            from: trackByBlob.get(blend.outgoing),
            to: trackByBlob.get(blend.incoming),
          }
        : null,

    youTube: youTube
      ? {
          seek: youTubeSeek,
          time: youTubeTime,
          onTime: reportYouTubeTime,
          onDuration: reportYouTubeDuration,
          onEnded: youTubeEnded,
          onError: showYouTubeError,
        }
      : null,
    stageYouTubePlayers:
      youTube && current ? [{ track: current, gain: 1, startGain: 1, fadeSeconds: 0.25 }] : [],
    state,
    buffering,
    toggleMute,
    current,
    clock,
    get time() {
      return youTube ? youTubeTime : clock.get();
    },
    duration: youTube ? youTubeDuration || (current?.duration ?? 0) : duration,
    volume,

    error: missingAudio
      ? 'This song has no audio stored on this device. Import the file again.'
      : !online && youTube
        ? 'YouTube songs need an internet connection.'
        : error,
    setError,
    setVolume,
    dispatch,
    play,
    seek,
    previous,
    shuffle,
  };
}
