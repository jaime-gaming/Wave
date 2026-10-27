import { automaticMixSeconds } from '../domain/mix';
import { isUsablePlan, planTransition } from '../domain/mixPlanner';
import { analyzeTrack, cachedAnalysis } from '../audio/mixAnalysis';
import { continuationQueue } from '../domain/continuation';
import { readPlaybackSession, writePlaybackSession } from '../domain/playbackSession';
import { MixAudio } from '../audio/MixAudio';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { playerReducer, shuffleQueue } from '../domain/player';
import { resolvePlayable } from '../domain/youtubeTrack';
import { planEdgeHandover } from '../domain/edgeMix';
import type { Track } from '../domain/types';

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
export function usePlayer(tracks: Track[], libraryReady = true) {
  const [saved] = useState(readPlaybackSession);
  const [mixEnabled, setMixEnabled] = useState(savedMix);
  const [autoplay, setAutoplay] = useState(savedAutoplay);
  /** Bumped when a background analysis lands, so tempo readouts refresh. */
  const recent = useRef<string[]>([]);
  const positions = useRef(saved.positions);
  const resumeId = useRef<string | undefined>(saved.state.queue[saved.state.index]);
  const readyRef = useRef(libraryReady);
  const [state, dispatch] = useReducer(playerReducer, saved.state);
  const [time, setTime] = useState(0);
  const [blend, setBlend] = useState<{
    outgoing: Blob;
    incoming: Blob;
    progress: number;
    seconds: number;
  } | null>(null);
  const [duration, setDuration] = useState(0);
  const [durationTrackId, setDurationTrackId] = useState<string>();
  const [volume, updateVolume] = useState(() => savedVolume());
  /**
   * YouTube songs are driven by the embedded player, which is the master clock.
   * The track id is stored with the clock so a new song starts from zero without
   * an effect that would reset state after a render.
   */
  const [youTubeClock, setYouTubeClock] = useState<{
    id?: string;
    time: number;
    duration: number;
  }>({ time: 0, duration: 0 });
  const [youTubeSeek, setYouTubeSeek] = useState({ seconds: 0, nonce: 0 });
  /**
   * Handover state for songs that involve YouTube. `pending` is the embed that
   * starts before the song becomes current, so the crossfade has two audible
   * sides; `outgoingGain` lets the current embed fade out under the next file.
   */
  const [edge, setEdge] = useState<{
    pending?: { track: Track; fadeSeconds: number };
    outgoingGain: number;
    outgoingFade: number;
  }>({ outgoingGain: 1, outgoingFade: 0.25 });
  const edgeRef = useRef<{ toId?: string; direction: 'into' | 'outOf'; seconds: number } | null>(
    null,
  );
  const lastAudible = useRef(volume || savedVolume('wave-last-audible-volume') || 1);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');
  const engine = useRef<MixAudio | null>(null);
  const context = useRef({ tracks, mixEnabled, autoplay });
  const stateRef = useRef(state);
  const current = tracks.find((track) => track.id === state.queue[state.index]);
  /** A YouTube row plays from a local twin when one exists; the file always wins. */
  const playable = resolvePlayable(current, tracks);
  const youTube = !!playable?.fromYouTube;
  const blob = playable?.track.blob;
  const youTubeTime = youTubeClock.id === current?.id ? youTubeClock.time : 0;
  const youTubeDuration = youTubeClock.id === current?.id ? youTubeClock.duration : 0;
  /** Read by callbacks that must not close over a stale render. */
  const youTubeRef = useRef(youTube);
  const youTubeTimeRef = useRef(youTubeTime);
  const youTubeDurationRef = useRef(youTubeDuration);
  const currentIdRef = useRef(current?.id);
  const edgeStartedAt = useRef(0);
  useEffect(() => {
    youTubeRef.current = youTube;
    youTubeTimeRef.current = youTubeTime;
    youTubeDurationRef.current = youTubeDuration;
    currentIdRef.current = current?.id;
  }, [youTube, youTubeTime, youTubeDuration, current?.id]);
  /**
   * Mix analysis runs in a worker on a downmixed copy, so the interface keeps its
   * frame budget. Results are cached per file, so a song is analysed at most once.
   */
  const prime = useCallback((blob: Blob | undefined) => {
    if (!blob) return;
    const cached = cachedAnalysis(blob);
    if (cached) {
      engine.current?.setAnalysis(blob, cached);
      return;
    }
    void analyzeTrack(blob).then((analysis) => {
      if (!analysis) return;
      engine.current?.setAnalysis(blob, analysis);
    });
  }, []);

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
    context.current = { tracks, mixEnabled, autoplay };
  }, [state, tracks, mixEnabled, autoplay]);
  useEffect(() => {
    try {
      localStorage.setItem('wave-mix-v2', String(mixEnabled));
      localStorage.setItem('wave-autoplay', String(autoplay));
    } catch {
      /* Session preferences. */
    }
    if (!mixEnabled) {
      engine.current?.cancelTransition();
      engine.current?.prepare();
    }
    engine.current?.setMixEnabled(mixEnabled);
  }, [mixEnabled, autoplay]);
  useEffect(() => {
    prime(current?.blob);
  }, [current?.blob, prime]);
  useEffect(() => {
    if (current?.id && recent.current.at(-1) !== current.id)
      recent.current = [...recent.current.slice(-31), current.id];
  }, [current?.id]);
  const flushSession = useCallback(() => {
    if (!readyRef.current) return;
    const deck = engine.current?.active;
    const track = context.current.tracks.find((track) => track.blob === deck?.blob);
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
      const current = ctx.tracks.find((t) => t.id === latest.queue[latest.index]);
      if (!current) return false;
      const ids = continuationQueue(ctx.tracks, current, [...latest.queue, ...recent.current]);
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
      return context.current.tracks.find((track) => track.id === latest.queue[index]);
    };
    const player = new MixAudio({
      time: (value) =>
        setTime((previous) =>
          value === 0 || Math.abs(value - previous) >= 0.09 ? value : previous,
        ),
      blend: setBlend,
      duration: (seconds) => {
        setDuration(seconds);
        setDurationTrackId(
          context.current.tracks.find((track) => track.blob === player.active.blob)?.id,
        );
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
          void player.restart().catch((reason: unknown) => {
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
        const next = target();
        // Buffering the next song well before the mix point keeps the handover gapless.
        if (next?.blob && player.mixRemaining <= 25) player.prepare(next.blob);
        if (next?.blob) prime(next.blob);
        if (player.mixRemaining <= 10 && !player.transitioning && extend()) return;
        if (!next?.blob) return;
        const element = player.element,
          remaining = player.mixRemaining;
        if (!Number.isFinite(element.duration) || element.duration <= 0 || remaining <= 0) return;
        const from = stateRef.current.queue[stateRef.current.index];
        const stillTarget = () => {
          if (stateRef.current.queue[stateRef.current.index] !== from) return false;
          const live = target();
          return !!live && live.id === next.id && live.blob === next.blob;
        };
        const onStarted = () => dispatch({ type: 'jump', id: next.id });
        const outgoingAnalysis = cachedAnalysis(player.active.blob);
        const incomingAnalysis = cachedAnalysis(next.blob);
        if (outgoingAnalysis && incomingAnalysis) {
          const plan = planTransition(outgoingAnalysis, incomingAnalysis, {
            fallbackSeconds: automaticMixSeconds(
              element.duration,
              player.preparedDuration || next.duration,
            ),
          });
          if (isUsablePlan(plan, remaining) && element.currentTime >= plan.startAt - 0.05)
            player.transitionWithPlan(next.blob, plan, stillTarget, onStarted);
          return;
        }
        // No analysis yet: fall back to a plain equal-power overlap timed by length.
        if (
          remaining <=
          automaticMixSeconds(element.duration, player.preparedDuration || next.duration)
        )
          player.transition(
            next.blob,
            automaticMixSeconds(element.duration, player.preparedDuration || next.duration),
            stillTarget,
            onStarted,
          );
      },
    });
    engine.current = player;
    player.setMixEnabled(context.current.mixEnabled);
    return () => {
      player.destroy();
      engine.current = null;
    };
    // `prime` and the context refs are stable by design: the engine lives once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const outgoing = engine.current?.outgoingBlob;
    if (
      outgoing &&
      !tracks.some((track) => track.blob === outgoing && state.queue.includes(track.id))
    )
      engine.current?.cancelTransition();
  }, [tracks, state.queue]);
  /**
   * Crossfades that involve a YouTube song.
   *
   * A YouTube song has no local bytes, so the beat-matched path cannot run. What
   * still works is a real equal-power overlap between the embed and a local deck:
   * one side ramps down while the other ramps up, inside a window sized from the
   * two durations. The local side is driven by `MixAudio.fadeOut/fadeIn`, the
   * embed by its own volume ramp, so both ends of the handover move together.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      const player = engine.current;
      const latest = stateRef.current;
      const ctx = context.current;
      if (!player) return;
      const currentRow = ctx.tracks.find((track) => track.id === latest.queue[latest.index]);
      const nextIndex =
        latest.index + 1 < latest.queue.length
          ? latest.index + 1
          : latest.repeat === 'all'
            ? 0
            : -1;
      const nextRow = ctx.tracks.find((track) => track.id === latest.queue[nextIndex]);

      if (!latest.playing || latest.repeat === 'one' || !ctx.mixEnabled || !nextRow) {
        if (edgeRef.current) {
          edgeRef.current = null;
          player.cancelFade();
          setEdge({ outgoingGain: 1, outgoingFade: 0.3 });
        }
        return;
      }

      const from = resolvePlayable(currentRow, ctx.tracks);
      const to = resolvePlayable(nextRow, ctx.tracks);
      if (!from || !to) return;

      const running = edgeRef.current;
      if (running && performance.now() - edgeStartedAt.current >= running.seconds * 1000) {
        edgeRef.current = null;
        dispatch({ type: 'jump', id: nextRow.id });
        // The embed that faded in is now the song; anything else returns to unity.
        setEdge((value) => ({
          pending: running.direction === 'into' ? value.pending : undefined,
          outgoingGain: 1,
          outgoingFade: 0.3,
        }));
        return;
      }
      if (running) return;

      // Keep the pending embed only while it is the song being handed over.
      setEdge((value) =>
        value.pending && value.pending.track.id !== latest.queue[latest.index]
          ? { ...value, pending: undefined }
          : value,
      );

      // Both sides local: the beat-matched planner owns this handover.
      if (!from.fromYouTube && !to.fromYouTube) return;

      const outgoingDuration = from.fromYouTube
        ? youTubeDurationRef.current || currentRow?.duration || 0
        : player.element.duration;
      const position = from.fromYouTube ? youTubeTimeRef.current : player.element.currentTime;
      if (!Number.isFinite(outgoingDuration) || outgoingDuration <= 0) return;
      const { seconds } = planEdgeHandover(outgoingDuration, to.track.duration || 0);
      const remaining = outgoingDuration - position;
      if (remaining > seconds || remaining <= 0.2) return;

      if (to.fromYouTube) {
        edgeRef.current = { direction: 'into', seconds };
        edgeStartedAt.current = performance.now();
        player.fadeOut(seconds, true);
        setEdge({
          pending: { track: nextRow, fadeSeconds: seconds },
          outgoingGain: 0,
          outgoingFade: seconds,
        });
        return;
      }
      if (!to.track.blob) return;
      edgeRef.current = { direction: 'outOf', seconds };
      edgeStartedAt.current = performance.now();
      player.load(to.track.blob);
      void player.play().catch(() => undefined);
      player.fadeIn(seconds);
      setEdge({ outgoingGain: 0, outgoingFade: seconds });
    }, 150);
    return () => clearInterval(timer);
  }, []);
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
      setTime(Math.min(position, player.element.duration));
      resumeId.current = undefined;
    };
    element.addEventListener('loadedmetadata', restore);
    restore();
    return () => element.removeEventListener('loadedmetadata', restore);
  }, [blob, current?.id]);
  useEffect(() => {
    const player = engine.current;
    if (!player || !blob) return;
    let active = true;
    if (state.playing) {
      void player.play().catch((reason: unknown) => {
        if (!active || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setBuffering(false);
        setError('Playback could not start. Press play to try again or choose another track.');
        dispatch({ type: 'pause' });
      });
    } else player.pause();
    return () => {
      active = false;
    };
  }, [state.playing, blob]);
  useEffect(() => {
    engine.current?.setVolume(volume);
    try {
      localStorage.setItem('wave-volume', String(volume));
      if (volume > 0) localStorage.setItem('wave-last-audible-volume', String(volume));
    } catch {
      /* Session-only volume. */
    }
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
  const seek = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    if (youTubeRef.current) {
      const next = Math.max(0, seconds);
      setYouTubeClock((value) => ({
        id: currentIdRef.current,
        time: next,
        duration: value.duration,
      }));
      setYouTubeSeek((value) => ({ seconds: next, nonce: value.nonce + 1 }));
      return;
    }
    const player = engine.current;
    if (!player || !Number.isFinite(player.element.duration) || player.element.duration <= 0)
      return;
    const next = Math.max(0, Math.min(seconds, player.element.duration));
    player.seek(next);
    setTime(next);
  }, []);
  const previous = useCallback(() => {
    const position = youTubeRef.current
      ? youTubeTimeRef.current
      : (engine.current?.element.currentTime ?? 0);
    if (position > 3) seek(0);
    else dispatch({ type: 'previous' });
  }, [seek]);
  const play = useCallback(
    (list: Track[], id: string) => {
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
      } catch {
        /* Optional browser support. */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* Optional browser support. */
        }
      }
    };
  }, [current, state.playing, previous, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      if (duration > 0 && Number.isFinite(duration))
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.max(0, Math.min(time, duration)),
        });
      else navigator.mediaSession.setPositionState();
    } catch {
      /* Position reporting is optional. */
    }
  }, [time, duration]);

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
  /** Called by the embed when the video reaches its end. */
  const youTubeEnded = useCallback(() => {
    const latest = stateRef.current;
    if (!latest.playing) return;
    if (latest.repeat === 'one') {
      setYouTubeSeek((value) => ({ seconds: 0, nonce: value.nonce + 1 }));
      return;
    }
    dispatch({ type: 'ended' });
  }, []);
  const showYouTubeError = useCallback((message: string) => setError(message), []);
  /** The embed reports its own position and length; both drive Wave's transport. */
  const reportYouTubeTime = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    setYouTubeClock((value) => ({
      id: currentIdRef.current,
      time: Math.max(0, seconds),
      duration: value.duration,
    }));
  }, []);
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
  return {
    mixEnabled,
    setMixEnabled,
    autoplay,
    setAutoplay,
    reorderQueue,
    readElement,
    readTime,
    durationTrackId,
    enqueue,
    blend: blend
      ? {
          ...blend,
          from: tracks.find((track) => track.blob === blend.outgoing),
          to: tracks.find((track) => track.blob === blend.incoming),
        }
      : null,
    /** YouTube songs: the embed is the source and the master clock. */
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
    /**
     * The YouTube player to mount: the song being handed over (fading in) or the
     * current song (possibly fading out under the next file).
     */
    stageYouTube: edge.pending
      ? edge.pending.track.id === current?.id
        ? { track: edge.pending.track, gain: 1, startGain: 1, fadeSeconds: 0.25 }
        : {
            track: edge.pending.track,
            gain: 1,
            startGain: 0,
            fadeSeconds: edge.pending.fadeSeconds,
          }
      : youTube && current
        ? { track: current, gain: edge.outgoingGain, startGain: 1, fadeSeconds: edge.outgoingFade }
        : null,
    state,
    buffering,
    toggleMute,
    current,
    time: youTube ? youTubeTime : time,
    duration: youTube ? youTubeDuration || (current?.duration ?? 0) : duration,
    volume,
    error,
    setError,
    setVolume,
    dispatch,
    play,
    seek,
    previous,
    shuffle,
  };
}
