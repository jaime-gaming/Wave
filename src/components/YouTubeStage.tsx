import { useCallback, useEffect, useRef, useState } from 'react';
import {
  embedErrorMessage,
  readEmbedError,
  readEmbedEvent,
  youtubeEmbedUrl,
} from '../domain/youtube';
import type { Track } from '../domain/types';

export interface YouTubeSeek {
  seconds: number;
  /** Bumped for every seek so repeated seeks to the same second still apply. */
  nonce: number;
}

/**
 * Playback for songs that live on YouTube.
 *
 * The video *is* the source: it plays through the official embed, with sound, and
 * Wave drives it with its own transport — the video has no controls of its own.
 * Nothing is downloaded, proxied or extracted; the link to the song on YouTube
 * lives in the song's options.
 *
 * Sync is one-directional here — the embed is the master clock — because there is
 * no local file to compare against. Wave reads its position and duration from the
 * player's own `infoDelivery` events and interpolates between them so the seek bar
 * stays smooth.
 */
export function YouTubeStage({
  track,
  playing,
  volume,
  gain = 1,
  startGain = 1,
  fadeSeconds = 0.25,
  seek,
  startAt = 0,
  silent = false,
  onTime,
  onDuration,
  onEnded,
  onError,
}: {
  track: Track;
  playing: boolean;
  volume: number;
  /** Mix gain for this song, 0..1, applied on top of the master volume. */
  gain?: number;
  /** Gain when the player mounts, so a crossfade starts from silence. */
  startGain?: number;
  /** How long a gain change takes, so a crossfade is a ramp, not a step. */
  fadeSeconds?: number;
  seek: YouTubeSeek;
  /** Position used when the player has to be mounted again, e.g. after expanding. */
  startAt?: number;
  /** Keeps the player alive but out of the way while Now Playing is collapsed. */
  silent?: boolean;
  onTime: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  /** Set when the embed refuses the video; retrying play would be pointless. */
  const refused = useRef(false);
  const clock = useRef({ time: 0, playing: false, duration: 0, at: 0 });
  const videoId = track.videoId ?? '';
  // Captured once: the embed URL must not change while the video is playing.
  // A changing `src` reloads the iframe and restarts the song from zero.
  /** Whether the song was already playing when this embed was mounted. */
  const [autoplay] = useState(playing);
  /** Position to resume from on the embed's first ready event, then cleared. */
  const pendingResume = useRef(Math.max(0, startAt));
  /**
   * The last jump Wave asked for, and when it asked.
   *
   * The embed keeps reporting for a moment after a `seekTo` and those reports
   * still carry the old position. Taking them at face value put the bar, the
   * lyrics and the clip out of step for a second or so after every jump, which
   * is what "it sometimes drifts" looked like. For a short window after a jump,
   * a report that is nowhere near where we asked is the past, not the present.
   */
  const jump = useRef({ at: Number.NEGATIVE_INFINITY, target: 0 });

  /** The level the embed should be at right now. */
  const target = useCallback(
    () => Math.min(1, Math.max(0, volume)) * Math.min(1, Math.max(0, gain)),
    [volume, gain],
  );

  const post = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*',
    );
  }, []);

  // Resume where Wave was when this instance mounted (expanding or collapsing
  // Now Playing mounts a new player; the song must not jump back to the start).
  useEffect(() => {
    if (!ready) return;
    if (pendingResume.current > 0.5) {
      jump.current = { at: performance.now(), target: pendingResume.current };
      post('seekTo', [pendingResume.current, true]);
      clock.current = { ...clock.current, time: pendingResume.current, at: performance.now() };
      onTime(pendingResume.current);
      pendingResume.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, post]);

  // Messages from the embed are untrusted: only documented events for this video.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = typeof event.data === 'string' ? safeJson(event.data) : event.data;
      const refusal = readEmbedError(data, videoId);
      if (refusal) {
        refused.current = true;
        onError(embedErrorMessage(refusal.code));
        return;
      }
      const info = readEmbedEvent(data, videoId);
      if (!info) return;
      const settling = performance.now() - jump.current.at < 900;
      if (settling && Math.abs(info.currentTime - jump.current.target) > 1.5) {
        // Stale: keep the state and the duration, ignore the old position.
        clock.current = {
          ...clock.current,
          playing: info.state === 'playing',
          duration: info.duration,
        };
        setReady(true);
        return;
      }
      clock.current = {
        time: info.currentTime,
        playing: info.state === 'playing',
        duration: info.duration,
        at: performance.now(),
      };
      setReady(true);
      if (info.state === 'playing') setStarted(true);
      onTime(info.currentTime);
      if (info.duration > 0) onDuration(info.duration);
      if (info.state === 'ended') onEnded();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [videoId, onEnded, onTime, onDuration, onError]);

  // The embed is the master clock; interpolate between its updates.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const { time, playing: running, at } = clock.current;
      if (!running) return;
      onTime(time + (performance.now() - at) / 1000);
    }, 250);
    return () => clearInterval(timer);
  }, [ready, onTime]);

  /**
   * Play is commanded immediately and retried until the embed confirms it.
   * Waiting for a first `infoDelivery` was fragile: on a slow or blocked embed
   * that event may never arrive, and the song then looked like it never loaded.
   */
  useEffect(() => {
    if (!playing) {
      post('pauseVideo');
      return;
    }
    let retry: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (clock.current.playing || refused.current) return;
      post('playVideo');
      // Volume is re-sent with every attempt: like the command itself, it is
      // dropped until the embed exists, and the song would otherwise start at
      // YouTube's own level or stay unheard.
      post('setVolume', [Math.round(target() * 100)]);
      retry = setTimeout(send, 500);
    };
    send();
    return () => {
      if (retry) clearTimeout(retry);
    };
  }, [playing, post, target]);

  useEffect(() => {
    if (!ready || seek.nonce === 0) return;
    jump.current = { at: performance.now(), target: Math.max(0, seek.seconds) };
    post('seekTo', [Math.max(0, seek.seconds), true]);
    clock.current = { ...clock.current, time: Math.max(0, seek.seconds), at: performance.now() };
    onTime(Math.max(0, seek.seconds));
    if (playing) post('playVideo');
  }, [seek, ready, playing, post, onTime]);

  /**
   * Volume is ramped, never stepped: a crossfade out of (or into) a YouTube song
   * sends one target and the player eases towards it at the frame rate, which is
   * the same equal-power window the local deck uses.
   */
  const applied = useRef<number | null>(startGain);
  const ramp = useRef<number | null>(null);
  useEffect(() => {
    const level = target();
    const send = (value: number) => post('setVolume', [Math.round(value * 100)]);
    const from = applied.current;
    applied.current = level;
    if (ramp.current !== null) cancelAnimationFrame(ramp.current);
    if (from === null || fadeSeconds < 0.05) {
      send(level);
      return;
    }
    const started = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - started) / (fadeSeconds * 1000));
      send(from + (level - from) * p);
      ramp.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    ramp.current = requestAnimationFrame(step);
    return () => {
      if (ramp.current !== null) cancelAnimationFrame(ramp.current);
      ramp.current = null;
    };
  }, [target, fadeSeconds, post]);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (!started && !refused.current)
        onError(
          'YouTube did not start. Some browsers block video that starts by itself; open the song on YouTube if it stays silent.',
        );
    }, 8_000);
    return () => clearTimeout(timer);
  }, [playing, started, onError]);

  return (
    <div
      className={`video-backdrop video-backdrop--source${silent ? ' youtube-silent' : ''}`}
      aria-label={silent ? undefined : 'YouTube song'}
      aria-hidden={silent || undefined}
    >
      <iframe
        ref={frame}
        title={`YouTube video for ${track.title}`}
        className="video-backdrop-frame"
        src={youtubeEmbedUrl(videoId, {
          origin: typeof location === 'undefined' ? undefined : location.origin,
          // Mounting happens on a click, so autoplay is allowed here and means
          // the video starts even if the first command message is lost.
          autoplay,
          controls: false,
          mute: false,
          disableKeyboard: true,
        })}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {/* No second bar: the player's own transport drives this embed. */}
      <div className="video-backdrop-veil" aria-hidden="true" />
    </div>
  );
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
