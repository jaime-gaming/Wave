import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { readEmbedEvent, youtubeEmbedUrl, youtubeWatchUrl } from '../domain/youtube';
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
 * Wave drives it with its own transport. Nothing is downloaded, proxied or
 * extracted, and the provider stays identifiable through the small YouTube link.
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
  const clock = useRef({ time: 0, playing: false, duration: 0, at: 0 });
  const videoId = track.videoId ?? '';
  // Captured once: the embed URL must not change while the video is playing.
  /** Position to resume from on the embed's first ready event, then cleared. */
  const pendingResume = useRef(Math.max(0, startAt));

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
      const info = readEmbedEvent(data, videoId);
      if (!info) return;
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
  }, [videoId, onEnded, onTime, onDuration]);

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

  useEffect(() => {
    if (!ready) return;
    post(playing ? 'playVideo' : 'pauseVideo');
  }, [playing, ready, post]);

  useEffect(() => {
    if (!ready || seek.nonce === 0) return;
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
    if (!ready) return;
    const target = Math.min(1, Math.max(0, volume)) * Math.min(1, Math.max(0, gain));
    const send = (value: number) => post('setVolume', [Math.round(value * 100)]);
    const from = applied.current;
    applied.current = target;
    if (ramp.current !== null) cancelAnimationFrame(ramp.current);
    if (from === null || fadeSeconds < 0.05) {
      send(target);
      return;
    }
    const started = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - started) / (fadeSeconds * 1000));
      send(from + (target - from) * p);
      ramp.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    ramp.current = requestAnimationFrame(step);
    return () => {
      if (ramp.current !== null) cancelAnimationFrame(ramp.current);
      ramp.current = null;
    };
  }, [volume, gain, fadeSeconds, ready, post]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (ready && playing && !started)
        onError('The video did not start. Press play again to give YouTube permission.');
    }, 4_000);
    return () => clearTimeout(timer);
  }, [ready, playing, started, onError]);

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
          autoplay: false,
          controls: false,
          mute: false,
          disableKeyboard: true,
        })}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="video-backdrop-veil" aria-hidden="true" />
      <div className="video-backdrop-bar">
        <span className="video-backdrop-status" role="status">
          {started ? 'Playing from YouTube' : 'YouTube · press play'}
        </span>
        <div className="video-backdrop-actions">
          <a
            className="text-button"
            href={youtubeWatchUrl(videoId)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open this song on YouTube"
          >
            <ExternalLink size={15} aria-hidden="true" /> YouTube
          </a>
        </div>
      </div>
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
