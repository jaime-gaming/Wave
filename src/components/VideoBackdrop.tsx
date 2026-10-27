import { useCallback, useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { readEmbedEvent, youtubeEmbedUrl } from '../domain/youtube';
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
}: {
  track: Track;
  time: number;
  duration: number;
  playing: boolean;
}) {
  const [clips, setClips] = useState(() => loadClips());
  const [search, setSearch] = useState<'searching' | 'empty' | 'unavailable'>('searching');
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  const clip = getClip(track.id, clips);

  // A clip can also be removed from the song's options; re-read when that happens.
  useEffect(() => {
    const sync = () => setClips(loadClips());
    window.addEventListener(CLIPS_CHANGED, sync);
    return () => window.removeEventListener(CLIPS_CHANGED, sync);
  }, []);

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

  if (clip)
    return (
      <ClipPlayer
        // Remounting per video is how playback state resets; no effect needed.
        key={clip.videoId}
        clip={clip}
        time={time}
        duration={duration}
        playing={playing}
      />
    );

  // Nothing to show yet: a short note, not a black sheet over the whole player.
  return (
    <EmptyState
      className="clip-note"
      symbolClassName="clip-note-symbol"
      level={3}
      announce
      icon={<Film size={18} />}
      title="Video clip"
      description={
        !online
          ? 'Clip search needs a connection. A saved clip still plays.'
          : search === 'searching'
            ? 'Looking for this song on YouTube…'
            : search === 'empty'
              ? 'No clip matched this song closely enough.'
              : 'Clip search is unreachable right now. Try again later.'
      }
      actions={
        search !== 'searching' ? (
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
        ) : undefined
      }
    />
  );
}

/**
 * The clip itself: a muted, control-free video behind Now Playing.
 *
 * It has no controls of its own — no bar, no slider, no buttons — because the
 * song already has a transport. Play, pause, seek and the drift correction all
 * come from the player, exactly like the audio.
 */
function ClipPlayer({
  clip,
  time,
  duration,
  playing,
}: {
  clip: StoredClip;
  time: number;
  duration: number;
  playing: boolean;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const latest = useRef<VideoState>(OFFLINE);
  const cooldown = useRef(0);

  // Nothing is drawn from the embed's state any more; the sync loop only needs
  // the latest value.
  const publish = useCallback((next: VideoState) => {
    latest.current = next;
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
          // No manual offset: the correction loop closes small drift by itself.
          offset: 0,
          now: Date.now(),
          cooldownUntil: cooldown.current,
        }),
      );
    }, 500);
    return () => clearInterval(timer);
  }, [time, playing, duration, command]);

  return (
    // Decoration: the song's transport is the only control surface.
    <div className="video-backdrop" aria-hidden="true">
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
