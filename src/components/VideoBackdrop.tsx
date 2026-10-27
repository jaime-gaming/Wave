import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Film, Link2, X } from 'lucide-react';
import { readEmbedEvent, youtubeEmbedUrl } from '../domain/youtube';
import {
  clampVideoOffset,
  planVideoSync,
  VIDEO_CORRECTION_COOLDOWN_MS,
  VIDEO_OFFSET_LIMIT_SECONDS,
  videoStatusLabel,
  type VideoCommand,
  type VideoState,
} from '../domain/videoSync';
import { getClip, loadClips, removeClip, saveClip, type StoredClip } from '../domain/videoClips';
import { findClip, rememberClip } from '../services/clipSearch';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import type { Track } from '../domain/types';

const OFFLINE: VideoState = { position: 0, playing: false, ready: false };

/**
 * The video clip behind Now Playing, in the style of Spotify's canvas.
 *
 * Rules that keep this honest and safe:
 * - The clip is **always muted**. Audio is the user's own file, so Wave's audio
 *   quality guarantee is untouched by the video.
 * - Player chrome is hidden (`controls=0`, `disablekb=1`, `modestbranding`) and
 *   Wave's transport drives it through the IFrame API.
 * - YouTube requires its player to stay identifiable, so a small "YouTube" link
 *   stays visible. Wave cannot remove YouTube's watermark, ads or overlay; that
 *   belongs to the provider, not to the app.
 * - Sync is best effort by design: the embed buffers on its own. Drift beyond a
 *   threshold is corrected; smaller drift is left alone to avoid stutter, and the
 *   status line says what is happening.
 */
export function VideoBackdrop({
  track,
  time,
  duration,
  playing,
  onClose,
}: {
  track: Track;
  time: number;
  duration: number;
  playing: boolean;
  onClose: () => void;
}) {
  const [clips, setClips] = useState(() => loadClips());
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState<'searching' | 'empty' | 'unavailable' | 'manual'>(
    'searching',
  );
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  const clip = getClip(track.id, clips);

  // The clip is discovered, not pasted: search once per song and open the match.
  // Only title and artist leave the device; the result is remembered locally.
  useEffect(() => {
    if (clip) return;
    // Nothing to search without a connection. The panel says so; the effect runs
    // again as soon as the browser reports a network, so nothing gets stuck.
    if (!online) return;
    const controller = new AbortController();
    void findClip(
      { title: track.title, artist: track.artist, duration: track.duration },
      { signal: controller.signal, refresh: attempt > 0 },
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === 'found' && rememberClip(track.id, result.candidate)) {
        setClips(loadClips());
        return;
      }
      setSearch(result.status === 'empty' ? 'empty' : 'unavailable');
    });
    return () => controller.abort();
  }, [clip, online, track.id, track.title, track.artist, track.duration, attempt]);

  const add = () => {
    const result = saveClip(track.id, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    setDraft('');
    setClips(loadClips());
  };

  if (clip)
    return (
      <ClipPlayer
        // Remounting per video is how playback state resets; no effect needed.
        key={clip.videoId}
        clip={clip}
        time={time}
        duration={duration}
        playing={playing}
        onRemove={() => {
          setClips(removeClip(track.id));
        }}
        onClose={onClose}
      />
    );

  return (
    <div className="video-backdrop" aria-label="Video clip backdrop">
      <div className="video-backdrop-empty">
        <Film size={22} aria-hidden="true" />
        <p>
          <strong>Video clip</strong>
          <span>
            {!online
              ? 'Clip search needs a connection. A saved clip still plays.'
              : search === 'searching'
                ? 'Looking for this song on YouTube…'
                : search === 'empty'
                  ? 'No clip matched this song closely enough. Paste a link if you know one.'
                  : search === 'unavailable'
                    ? 'Clip search is unreachable right now. Paste a link, or try again later.'
                    : 'Paste the YouTube link for this song.'}{' '}
            The clip is muted and Wave keeps its own controls; audio still comes from your file.
          </span>
        </p>
        {search !== 'searching' && (
          <button
            type="button"
            className="text-button"
            disabled={!online}
            aria-label={networkAriaLabel(online, 'Search again')}
            onClick={() => {
              setSearch('searching');
              setAttempt((n) => n + 1);
            }}
          >
            {networkLabel(online, 'Search again')}
          </button>
        )}
        <div className="video-clip-form">
          <label>
            <Link2 size={16} aria-hidden="true" />
            <span className="sr-only">YouTube link</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://youtu.be/…"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') add();
              }}
            />
          </label>
          <button type="button" className="text-button" onClick={add} disabled={!draft.trim()}>
            Use clip
          </button>
        </div>
        {error && (
          <p className="video-clip-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ClipPlayer({
  clip,
  time,
  duration,
  playing,
  onRemove,
  onClose,
}: {
  clip: StoredClip;
  time: number;
  duration: number;
  playing: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<VideoState>(OFFLINE);
  const [offset, setOffset] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const latest = useRef<VideoState>(OFFLINE);
  const cooldown = useRef(0);

  const publish = useCallback((next: VideoState) => {
    latest.current = next;
    setState(next);
  }, []);

  const command = useCallback(
    (next: VideoCommand) => {
      const target = frame.current?.contentWindow;
      if (!target) return;
      const post = (func: string, args: unknown[] = []) => {
        target.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      };
      switch (next.type) {
        case 'play':
          post('playVideo');
          break;
        case 'pause':
          post('pauseVideo');
          break;
        case 'seek':
          post('seekTo', [next.to, true]);
          post('setPlaybackRate', [1]);
          cooldown.current = Date.now() + VIDEO_CORRECTION_COOLDOWN_MS;
          publish({ ...latest.current, position: next.to, rate: 1 });
          break;
        case 'seek-and-play':
          post('seekTo', [next.to, true]);
          post('setPlaybackRate', [1]);
          post('playVideo');
          cooldown.current = Date.now() + VIDEO_CORRECTION_COOLDOWN_MS;
          publish({ ...latest.current, position: next.to, playing: true, rate: 1 });
          break;
        case 'nudge':
          // Small drift is closed by playing the muted clip slightly faster or
          // slower for a moment, so the picture never jumps.
          post('setPlaybackRate', [next.rate]);
          publish({ ...latest.current, rate: next.rate });
          break;
        default:
          break;
      }
    },
    [publish],
  );

  // Messages from the embed are untrusted: only documented events for the
  // expected video are applied, and only from this iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = typeof event.data === 'string' ? safeJson(event.data) : event.data;
      const info = readEmbedEvent(data, clip.videoId);
      if (!info) return;
      publish({
        position: info.currentTime,
        playing: info.state === 'playing' || info.state === 'buffering',
        ready: true,
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clip.videoId, publish]);

  // Wave drives the clip from its own clock; a correction is only issued when the
  // picture drifts enough to be seen.
  useEffect(() => {
    const timer = setInterval(() => {
      command(
        planVideoSync({ position: time, playing }, latest.current, {
          duration,
          offset,
          now: Date.now(),
          cooldownUntil: cooldown.current,
        }),
      );
    }, 500);
    return () => clearInterval(timer);
  }, [time, playing, offset, duration, command]);

  const status = videoStatusLabel({
    enabled: true,
    ready: state.ready,
    playing: state.playing,
    muted: true,
    drift: Math.abs(state.position - Math.max(0, time + offset)),
  });

  return (
    <div className="video-backdrop" aria-label="Video clip backdrop">
      <iframe
        ref={frame}
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
      />
      <div className="video-backdrop-veil" aria-hidden="true" />
      <div className="video-backdrop-bar">
        <span className="video-backdrop-status" role="status">
          {status}
        </span>
        <div className="video-backdrop-actions">
          <label className="video-offset">
            <span>Sync</span>
            <input
              type="range"
              min={-VIDEO_OFFSET_LIMIT_SECONDS}
              max={VIDEO_OFFSET_LIMIT_SECONDS}
              step={0.1}
              value={offset}
              aria-label="Video clip sync offset in seconds"
              onChange={(event) => setOffset(clampVideoOffset(Number(event.target.value)))}
            />
            <output>{offset > 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1)}s</output>
          </label>
          <a
            className="video-backdrop-link"
            href={`https://www.youtube.com/watch?v=${clip.videoId}`}
            target="_blank"
            rel="noreferrer"
          >
            YouTube <ExternalLink size={12} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="icon-button"
            aria-label="Remove video clip"
            onClick={onRemove}
          >
            <X size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Hide video clip"
            onClick={onClose}
          >
            <Film size={16} />
          </button>
        </div>
      </div>
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
