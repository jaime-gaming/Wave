import { useCallback, useEffect, useRef, useState } from 'react';
import { Film } from './Glyphs';
import { EmptyState } from './EmptyState';
import {
  isYouTubeEmbedOrigin,
  readEmbedProgress,
  youtubeEmbedUrl,
  YOUTUBE_EMBED_HOST,
} from '../domain/youtube';
import {
  planVideoSync,
  VIDEO_CORRECTION_COOLDOWN_MS,
  type VideoCommand,
  type VideoState,
} from '../domain/videoSync';
import { CLIPS_CHANGED, getClip, loadClips, type StoredClip } from '../domain/videoClips';
import { findClip, rememberClip } from '../services/clipSearch';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import type { Track } from '../domain/types';

import { useT } from '../i18n';
const OFFLINE: VideoState = { position: 0, playing: false, ready: false };

const FRAME_ID = 'wave-clip-player';

export function VideoBackdrop({
  track,
  time,
  duration,
  playing,
  onRevealed,
}: {
  track: Track;
  time: number;
  duration: number;
  playing: boolean;

  onRevealed?: (shown: boolean) => void;
}) {
  const t = useT();
  const [clips, setClips] = useState(() => loadClips());
  const [search, setSearch] = useState<'searching' | 'empty' | 'unavailable'>('searching');
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  const clip = getClip(track.id, clips);

  useEffect(() => {
    const sync = () => setClips(loadClips());
    window.addEventListener(CLIPS_CHANGED, sync);
    return () => window.removeEventListener(CLIPS_CHANGED, sync);
  }, []);

  useEffect(() => {
    if (clip) return;

    if (!online) return;
    const controller = new AbortController();
    void findClip(
      {
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        fileName: track.fileName,
        rolesReviewed: track.rolesReviewed,
      },
      { signal: controller.signal, refresh: attempt > 0 },
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === 'found' && rememberClip(track.id, result.candidate, track.duration)) {
        setClips(loadClips());
        return;
      }
      setSearch(result.status === 'empty' ? 'empty' : 'unavailable');
    });
    return () => controller.abort();
  }, [
    clip,
    online,
    track.id,
    track.title,
    track.artist,
    track.duration,
    track.fileName,
    track.rolesReviewed,
    attempt,
  ]);

  if (clip)
    return (
      <ClipPlayer
        key={clip.videoId}
        clip={clip}
        time={time}
        duration={duration}
        playing={playing}
        onRevealed={onRevealed}
      />
    );

  return (
    <EmptyState
      className="clip-note"
      symbolClassName="clip-note-symbol"
      level={3}
      announce
      icon={<Film size={18} />}
      title={t('Video clip')}
      description={
        !online
          ? t('Clip search needs a connection. A saved clip still plays.')
          : search === 'searching'
            ? t('Looking for this song on YouTube…')
            : search === 'empty'
              ? t('No clip matched this song closely enough.')
              : t('Clip search is unreachable right now. Try again later.')
      }
      actions={
        search !== 'searching' ? (
          <button
            type="button"
            className="text-button"
            disabled={!online}
            aria-label={networkAriaLabel(online, t('Search again'))}
            onClick={() => {
              setSearch('searching');
              setAttempt((n) => n + 1);
            }}
          >
            {networkLabel(online, t('Search again'))}
          </button>
        ) : undefined
      }
    />
  );
}

function ClipPlayer({
  clip,
  time,
  duration,
  playing,
  onRevealed,
}: {
  clip: StoredClip;
  time: number;
  duration: number;
  playing: boolean;

  onRevealed?: (shown: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const latest = useRef<VideoState>(OFFLINE);
  const cooldown = useRef(0);

  const target = useRef({ position: time, playing, duration, at: 0 });

  const heard = useRef(false);

  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    onRevealed?.(revealed);
  }, [revealed, onRevealed]);
  useEffect(() => () => onRevealed?.(false), [onRevealed]);

  useEffect(() => {
    target.current = { position: time, playing, duration, at: performance.now() };
  }, [time, playing, duration]);

  const post = useCallback((message: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), YOUTUBE_EMBED_HOST);
  }, []);

  const wake = useCallback(() => {
    post({ event: 'listening', id: FRAME_ID, channel: 'widget' });
    post({ event: 'listening', id: FRAME_ID });
  }, [post]);

  const command = useCallback(
    (next: VideoCommand) => {
      const send = (func: string, args: unknown[] = []) =>
        post({ event: 'command', func, args, id: FRAME_ID });
      switch (next.type) {
        case 'play':
          send('playVideo');
          break;
        case 'pause':
          send('pauseVideo');
          break;
        case 'seek':
          send('seekTo', [next.to, true]);
          send('setPlaybackRate', [1]);
          cooldown.current = Date.now() + VIDEO_CORRECTION_COOLDOWN_MS;
          latest.current = { ...latest.current, position: next.to, rate: 1 };
          break;
        case 'seek-and-play':
          send('seekTo', [next.to, true]);
          send('setPlaybackRate', [1]);
          send('playVideo');
          cooldown.current = Date.now() + VIDEO_CORRECTION_COOLDOWN_MS;
          latest.current = { ...latest.current, position: next.to, playing: true, rate: 1 };
          break;
        case 'nudge':
          send('setPlaybackRate', [next.rate]);
          latest.current = { ...latest.current, rate: next.rate };
          break;
        default:
          break;
      }
    },
    [post],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !isYouTubeEmbedOrigin(event.origin))
        return;
      const data = typeof event.data === 'string' ? safeJson(event.data) : event.data;
      const info = readEmbedProgress(data, clip.videoId);
      if (!info) return;
      heard.current = true;
      const previous = latest.current;
      const isPlaying = info.state
        ? info.state === 'playing' || info.state === 'buffering'
        : previous.playing;
      latest.current = {
        position: info.currentTime,
        playing: isPlaying,
        ready: true,
        rate: previous.rate,
      };

      const settled = info.state === 'paused' || info.state === 'ended' || info.state === 'cued';
      if ((isPlaying && info.currentTime > 0.2) || settled) setRevealed(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clip.videoId]);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 6_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let ticks = 0;
    const timer = setInterval(() => {
      if (!heard.current) {
        wake();
        return;
      }
      ticks++;

      if (ticks % 20 === 0) wake();
      const wanted = target.current;
      const elapsed = wanted.playing ? (performance.now() - wanted.at) / 1000 : 0;
      command(
        planVideoSync(
          { position: wanted.position + elapsed, playing: wanted.playing },
          latest.current,
          {
            duration: wanted.duration,

            offset: 0,
            startAt: clip.startAt,
            clipLength: clip.duration,
            now: Date.now(),
            cooldownUntil: cooldown.current,
          },
        ),
      );
    }, 250);
    return () => clearInterval(timer);
  }, [clip.startAt, clip.duration, command, wake]);

  return (
    <div
      className={`video-backdrop${revealed ? ' is-revealed' : ''}${playing ? '' : ' is-paused'}`}
      aria-hidden="true"
    >
      <iframe
        ref={frame}
        id={FRAME_ID}
        title={`Video clip for ${clipTitle(clip)}`}
        className="video-backdrop-frame"
        src={youtubeEmbedUrl(clip.videoId, {
          origin: typeof location === 'undefined' ? undefined : location.origin,
          startAt: clip.startAt,
          autoplay: true,
          controls: false,
          mute: true,
          disableKeyboard: true,
          loop: true,
        })}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
        aria-hidden="true"
        onLoad={() => {
          heard.current = false;
          wake();
        }}
      />
      <div className="video-backdrop-veil" aria-hidden="true" />
    </div>
  );
}

const clipTitle = (clip: StoredClip) => (clip.videoId ? 'current song' : 'song');

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
