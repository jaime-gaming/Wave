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
  seek,
  onTime,
  onDuration,
  onEnded,
  onError,
}: {
  track: Track;
  playing: boolean;
  volume: number;
  seek: YouTubeSeek;
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

  const post = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*',
    );
  }, []);

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

  useEffect(() => {
    if (!ready) return;
    post('setVolume', [Math.round(Math.min(1, Math.max(0, volume)) * 100)]);
  }, [volume, ready, post]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (ready && playing && !started)
        onError('The video did not start. Press play again to give YouTube permission.');
    }, 4_000);
    return () => clearTimeout(timer);
  }, [ready, playing, started, onError]);

  return (
    <div className="video-backdrop video-backdrop--source" aria-label="YouTube song">
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
