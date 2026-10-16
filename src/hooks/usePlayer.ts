import { automaticMixSeconds } from '../domain/mix';
import { continuationQueue } from '../domain/continuation';
import { readPlaybackSession, writePlaybackSession } from '../domain/playbackSession';
import { MixAudio } from '../audio/MixAudio';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { playerReducer, shuffleQueue } from '../domain/player';
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
  const lastAudible = useRef(volume || savedVolume('wave-last-audible-volume') || 1);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');
  const engine = useRef<MixAudio | null>(null);
  const context = useRef({ tracks, mixEnabled, autoplay });
  const stateRef = useRef(state);
  const current = tracks.find((track) => track.id === state.queue[state.index]);

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
        if (player.mixRemaining <= 10 && !player.transitioning && extend()) return;
        const next = target();
        player.prepare(next?.blob);
        if (!next) return;
        const element = player.element,
          remaining = player.mixRemaining;
        if (
          Number.isFinite(element.duration) &&
          element.duration > 0 &&
          remaining > 0 &&
          remaining <=
            automaticMixSeconds(element.duration, player.preparedDuration || next.duration)
        ) {
          const from = stateRef.current.queue[stateRef.current.index];
          player.transition(
            next.blob,
            automaticMixSeconds(element.duration, player.preparedDuration || next.duration),
            () =>
              stateRef.current.queue[stateRef.current.index] === from && target()?.id === next.id,
            () => dispatch({ type: 'jump', id: next.id }),
          );
        }
      },
    });
    engine.current = player;
    player.setMixEnabled(context.current.mixEnabled);
    return () => {
      player.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    const outgoing = engine.current?.outgoingBlob;
    if (
      outgoing &&
      !tracks.some((track) => track.blob === outgoing && state.queue.includes(track.id))
    )
      engine.current?.cancelTransition();
  }, [tracks, state.queue]);
  const blob = current?.blob;
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
    const player = engine.current;
    if (
      !player ||
      !Number.isFinite(seconds) ||
      !Number.isFinite(player.element.duration) ||
      player.element.duration <= 0
    )
      return;
    const next = Math.max(0, Math.min(seconds, player.element.duration));
    player.seek(next);
    setTime(next);
  }, []);
  const previous = useCallback(() => {
    if ((engine.current?.element.currentTime ?? 0) > 3) seek(0);
    else dispatch({ type: 'previous' });
  }, [seek]);
  const play = useCallback((list: Track[], id: string) => {
    resumeId.current = undefined;
    positions.current[id] = 0;
    if (stateRef.current.queue[stateRef.current.index] === id && engine.current)
      engine.current.seek(0);
    dispatch({ type: 'load', queue: list.map((track) => track.id), id });
  }, []);
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
  const readTime = useCallback(() => engine.current?.element.currentTime ?? 0, []);
  const reorderQueue = useCallback((ids: string[]) => dispatch({ type: 'reorder', ids }), []);
  const readElement = useCallback(() => engine.current?.element, []);
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
    state,
    buffering,
    toggleMute,
    current,
    time,
    duration,
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
