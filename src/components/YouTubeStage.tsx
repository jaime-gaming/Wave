import { useCallback, useEffect, useRef, useState } from 'react';
import {
  YOUTUBE_EMBED_HOST,
  YOUTUBE_FALLBACK_EMBED_HOST,
  embedErrorMessage,
  embedPlayerState,
  isYouTubeEmbedOrigin,
  readEmbedError,
  readEmbedEvent,
  readEmbedProgress,
  youtubeEmbedUrl,
} from '../domain/youtube';
import type { Track } from '../domain/types';
import { useT } from '../i18n';
import { useOnline } from '../ui/network';

export interface YouTubeSeek {
  seconds: number;

  nonce: number;
}

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
  onStarted,
}: {
  track: Track;
  playing: boolean;
  volume: number;

  gain?: number;

  startGain?: number;

  fadeSeconds?: number;
  seek: YouTubeSeek;

  startAt?: number;

  silent?: boolean;
  onTime: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onStarted?: () => void;
}) {
  const t = useT();
  const online = useOnline();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [embedHost, setEmbedHost] = useState<string>(YOUTUBE_EMBED_HOST);

  const refused = useRef(false);
  const ended = useRef(false);
  const clock = useRef({ time: 0, playing: false, duration: 0, at: 0 });
  const videoId = track.videoId ?? '';

  const [autoplay] = useState(playing);

  const pendingResume = useRef(Math.max(0, startAt));

  const jump = useRef({ at: Number.NEGATIVE_INFINITY, target: 0 });

  const target = useCallback(
    () => Math.min(1, Math.max(0, volume)) * Math.min(1, Math.max(0, gain)),
    [volume, gain],
  );

  const post = useCallback(
    (func: string, args: unknown[] = []) => {
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }),
        embedHost,
      );
    },
    [embedHost],
  );

  const announceListening = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), embedHost);
    post('addEventListener', ['onReady']);
    post('addEventListener', ['onStateChange']);
    post('addEventListener', ['onError']);
    post('addEventListener', ['onAutoplayBlocked']);
  }, [post, embedHost]);

  useEffect(() => {
    if (!online) {
      clock.current.playing = false;
      onError(t('YouTube songs need an internet connection.'));
    }
  }, [online, onError, t]);

  useEffect(() => {
    if (ready || !online) return;
    announceListening();
    const timer = setInterval(announceListening, 350);
    return () => clearInterval(timer);
  }, [ready, online, announceListening]);

  useEffect(() => {
    if (!playing || !online || started || refused.current || embedHost !== YOUTUBE_EMBED_HOST) {
      return;
    }
    const timer = setTimeout(() => {
      if (!clock.current.playing && !refused.current && !ready) {
        setEmbedHost(YOUTUBE_FALLBACK_EMBED_HOST);
      }
    }, 4_200);
    return () => clearTimeout(timer);
  }, [playing, online, started, ready, embedHost]);

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

  useEffect(() => {
    if (started) onStarted?.();
  }, [started, onStarted]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !isYouTubeEmbedOrigin(event.origin))
        return;
      const data = typeof event.data === 'string' ? safeJson(event.data) : event.data;
      if (data && typeof data === 'object') {
        const rec = data as { event?: unknown; info?: unknown };
        if (rec.event === 'onAutoplayBlocked') {
          setAutoplayBlocked(true);
          if (silent) onError(t('YouTube did not start. Open the player and try again.'));
          return;
        }
        if (rec.event === 'onReady') {
          setReady(true);
          if (playing && !refused.current) {
            post('setVolume', [Math.round(target() * 100)]);
            post('unMute');
            post('playVideo');
          }
          return;
        }
        if (rec.event === 'onStateChange') {
          const directState = embedPlayerState(rec.info);
          if (directState) {
            setReady(true);
            clock.current.playing = directState === 'playing';
            clock.current.at = performance.now();
            if (directState === 'playing') {
              ended.current = false;
              setStarted(true);
              setAutoplayBlocked(false);
            }
            if (directState === 'ended' && !ended.current) {
              ended.current = true;
              onEnded();
            }
            return;
          }
        }
      }
      const refusal = readEmbedError(data, videoId);
      if (refusal) {
        refused.current = true;
        onError(embedErrorMessage(refusal.code));
        return;
      }
      const info = readEmbedEvent(data, videoId);
      const progress = info ? null : readEmbedProgress(data, videoId);
      if (!info && !progress) return;
      const reportedTime = info ? info.currentTime : progress!.currentTime;
      const reportedDuration = info ? info.duration : progress!.duration;
      const reportedState = info ? info.state : progress!.state;
      const settling = performance.now() - jump.current.at < 900;
      if (settling && Math.abs(reportedTime - jump.current.target) > 1.5) {
        clock.current = {
          ...clock.current,
          playing: reportedState ? reportedState === 'playing' : clock.current.playing,
          duration: reportedDuration || clock.current.duration,
        };
        setReady(true);
        return;
      }
      const nextPlaying = reportedState ? reportedState === 'playing' : clock.current.playing;
      clock.current = {
        time: reportedTime,
        playing: nextPlaying,
        duration: reportedDuration || clock.current.duration,
        at: performance.now(),
      };
      setReady(true);
      if (nextPlaying) {
        ended.current = false;
        setStarted(true);
        setAutoplayBlocked(false);
      }
      onTime(reportedTime);
      if (reportedDuration > 0) onDuration(reportedDuration);
      if (reportedState === 'ended' && !ended.current) {
        ended.current = true;
        onEnded();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [videoId, playing, post, target, onEnded, onTime, onDuration, onError, silent, t]);

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
    if (!playing || !online) {
      clock.current.playing = false;
      post('pauseVideo');
      return;
    }
    let retry: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (clock.current.playing || refused.current || autoplayBlocked) return;

      post('unMute');
      post('setVolume', [Math.round(target() * 100)]);
      post('playVideo');
      retry = setTimeout(send, 450);
    };
    send();
    return () => {
      if (retry) clearTimeout(retry);
    };
  }, [playing, online, post, target, autoplayBlocked]);

  const appliedSeek = useRef(0);
  useEffect(() => {
    if (!ready || seek.nonce === 0 || appliedSeek.current === seek.nonce) return;
    appliedSeek.current = seek.nonce;
    ended.current = false;
    jump.current = { at: performance.now(), target: Math.max(0, seek.seconds) };
    post('seekTo', [Math.max(0, seek.seconds), true]);
    clock.current = { ...clock.current, time: Math.max(0, seek.seconds), at: performance.now() };
    onTime(Math.max(0, seek.seconds));
    if (playing) post('playVideo');
  }, [seek, ready, playing, post, onTime]);

  const applied = useRef<number | null>(startGain);
  const ramp = useRef<number | null>(null);
  useEffect(() => {
    const level = target();
    const send = (value: number) => post('setVolume', [Math.round(value * 100)]);
    const restarting = seek.nonce > 0 && seek.seconds === 0;
    const from = restarting ? 0 : applied.current;
    applied.current = level;
    if (ramp.current !== null) cancelAnimationFrame(ramp.current);
    if (from === null || fadeSeconds < 0.05) {
      send(level);
      return;
    }
    if (restarting) send(0);
    const started = performance.now();
    const duration = restarting ? 0.22 : fadeSeconds;
    const step = () => {
      const p = Math.min(1, (performance.now() - started) / (duration * 1000));
      send(from + (level - from) * p);
      ramp.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    ramp.current = requestAnimationFrame(step);
    return () => {
      if (ramp.current !== null) cancelAnimationFrame(ramp.current);
      ramp.current = null;
    };
  }, [target, fadeSeconds, post, seek.nonce, seek.seconds]);

  useEffect(() => {
    if (!playing || !online) return;
    const timer = setTimeout(() => {
      if (!started && !refused.current)
        onError(
          t(
            'YouTube did not start. Some browsers block video that starts by itself; open the song on YouTube if it stays silent.',
          ),
        );
    }, 8_000);
    return () => clearTimeout(timer);
  }, [playing, online, started, onError, t]);

  if (!online) return null;

  return (
    <div
      className={`video-backdrop video-backdrop--source${silent ? ' youtube-silent' : ''}`}
      aria-label={silent ? undefined : t('YouTube song')}
      aria-hidden={silent || undefined}
    >
      <iframe
        key={embedHost}
        ref={frame}
        onLoad={announceListening}
        title={t('YouTube video for {title}', { title: track.title })}
        className="video-backdrop-frame"
        src={youtubeEmbedUrl(videoId, {
          origin: typeof location === 'undefined' ? undefined : location.origin,
          host: embedHost,

          autoplay,
          controls: false,
          mute: startGain === 0,
          disableKeyboard: true,
        })}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"

        tabIndex={-1}
        aria-hidden="true"
      />
      {autoplayBlocked && !silent && (
        <button
          className="youtube-start-button"
          type="button"
          onClick={() => {
            post('unMute');
            post('setVolume', [Math.round(target() * 100)]);
            post('playVideo');
          }}
        >
          {t('Play on YouTube')}
        </button>
      )}
      {}
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
