import { useCallback, useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { readEmbedProgress, youtubeEmbedUrl } from '../domain/youtube';
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
/** The iframe's id; the player echoes it back in every message it sends. */
const FRAME_ID = 'wave-clip-player';

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
  onRevealed,
}: {
  track: Track;
  time: number;
  duration: number;
  playing: boolean;
  /** Told when the picture is on screen, so the player can step back for it. */
  onRevealed?: (shown: boolean) => void;
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
      if (result.status === 'found' && rememberClip(track.id, result.candidate, track.duration)) {
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
        onRevealed={onRevealed}
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
  onRevealed,
}: {
  clip: StoredClip;
  time: number;
  duration: number;
  playing: boolean;
  /** Told when the picture is really on screen, so the player can step back. */
  onRevealed?: (shown: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const latest = useRef<VideoState>(OFFLINE);
  const cooldown = useRef(0);
  /**
   * The song's own clock, read by the loop without restarting it every tick.
   *
   * The interface reports the position ten times a second, so the last value is
   * up to a tenth of a second old when the loop looks at it. Comparing against
   * that stale number would park the picture permanently a little behind, so the
   * time elapsed since the report is added back while the song plays.
   */
  const target = useRef({ position: time, playing, duration, at: 0 });
  /** True once the player has answered at least once. */
  const heard = useRef(false);
  /**
   * The clip is not shown until it is actually playing, and only once the
   * player's own overlay has had time to fade out. YouTube draws its title bar
   * and logo over the picture for the first seconds; there is no way to ask it
   * not to, so the picture arrives after them instead of with them.
   */
  const [revealed, setRevealed] = useState(false);

  // The player folds its sleeve away while the picture is on screen, and comes
  // back the moment it is not: a paused clip is a still wash, not a backdrop.
  useEffect(() => {
    onRevealed?.(revealed);
  }, [revealed, onRevealed]);
  useEffect(() => () => onRevealed?.(false), [onRevealed]);

  useEffect(() => {
    target.current = { position: time, playing, duration, at: performance.now() };
  }, [time, playing, duration]);

  const post = useCallback((message: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
  }, []);

  /**
   * The player only talks to a page that has said it is listening.
   *
   * This is the whole reason the clip used to run on its own: without a
   * `listening` message — which the official IFrame API sends for you — YouTube
   * answers nothing, so Wave never learned where the picture was and never
   * corrected it. Commands are also ignored until then.
   */
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
          // Small drift is closed by playing the muted clip slightly faster or
          // slower for a moment, so the picture never jumps.
          send('setPlaybackRate', [next.rate]);
          latest.current = { ...latest.current, rate: next.rate };
          break;
        default:
          break;
      }
    },
    [post],
  );

  // Messages from the embed are untrusted: only documented events for the
  // expected video are applied, and only from this iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
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
      // The picture appears once it is really moving (the player has wiped its
      // own chrome by then), or straight away when it is paused and about to be
      // turned into a still wash instead.
      const settled = info.state === 'paused' || info.state === 'ended' || info.state === 'cued';
      if ((isPlaying && info.currentTime > 0.2) || settled) setRevealed(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clip.videoId]);

  /**
   * One loop for the whole conversation with the player: keep asking it to talk
   * until it does, then correct the picture whenever it has drifted far enough
   * to be seen.
   */
  // Never leave a black rectangle behind: if the player says nothing at all, the
  // picture is shown anyway and the sync loop keeps trying.
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 6_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let ticks = 0;
    const timer = setInterval(() => {
      // The first seconds are the fragile ones: the frame is still loading, so
      // the listening message is repeated until the player answers.
      if (!heard.current) {
        wake();
        return;
      }
      ticks++;
      // A long song repeats the handshake now and then: a player that reloaded
      // itself (age gate, network hiccup) stops answering otherwise.
      if (ticks % 20 === 0) wake();
      const wanted = target.current;
      const elapsed = wanted.playing ? (performance.now() - wanted.at) / 1000 : 0;
      command(
        planVideoSync(
          { position: wanted.position + elapsed, playing: wanted.playing },
          latest.current,
          {
            duration: wanted.duration,
            // The clip may be placed inside a longer upload, so the target is the
            // song's position plus that start. Otherwise the placement would be
            // mistaken for drift and the picture dragged back to the beginning.
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
    // Decoration: the song's transport is the only control surface.
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
          // A new document means a new handshake.
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
