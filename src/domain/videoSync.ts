/**
 * Keeping a YouTube clip aligned with the local song.
 *
 * The audio always comes from the user's own file, so the clip is muted and used
 * only as a backdrop: nothing about playback quality depends on YouTube. What can
 * drift is the picture. The embedded player cannot be seeked continuously without
 * stuttering, so this module only issues a correction when the picture is far
 * enough behind or ahead to be visible, with a cooldown so it never fights itself.
 *
 * It is deliberately a pure function: the component supplies the clocks and
 * applies the returned command.
 */
export const VIDEO_HARD_DRIFT_SECONDS = 1.1;
/**
 * Drift below this is invisible and left alone; above it the clip is nudged in
 * rate instead of being seeked, which is how video players resync without a
 * visible jump. Because the clip is muted, a temporary rate change costs nothing
 * in audio quality.
 */
export const VIDEO_SOFT_DRIFT_SECONDS = 0.15;
export const VIDEO_NUDGE_RATE = 0.1;
export const VIDEO_CORRECTION_COOLDOWN_MS = 4_000;
/** Offset the user can apply when a clip does not start on the right beat. */
export const VIDEO_OFFSET_LIMIT_SECONDS = 10;

export interface VideoTarget {
  /** Position of the song, in seconds. */
  position: number;
  playing: boolean;
}

export interface VideoState {
  position: number;
  playing: boolean;
  /** False until the embed has reported its first state. */
  ready: boolean;
  /** Playback rate currently applied to the embed, when known. */
  rate?: number;
}

export interface SyncOptions {
  /** Seconds added to the song position before comparing (user adjustment). */
  offset?: number;
  /** Duration of the song; clips longer than it are ignored past the end. */
  duration?: number;
  now?: number;
  /** Timestamp before which no correction should be issued. */
  cooldownUntil?: number;
  hardDrift?: number;
  softDrift?: number;
}

export type VideoCommand =
  | { type: 'none' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; to: number }
  | { type: 'seek-and-play'; to: number }
  /** Smooth correction: play the clip slightly fast or slow for a moment. */
  | { type: 'nudge'; rate: number };

export const clampVideoOffset = (seconds: number): number => {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(
    VIDEO_OFFSET_LIMIT_SECONDS,
    Math.max(-VIDEO_OFFSET_LIMIT_SECONDS, Math.round(seconds * 10) / 10),
  );
};

/**
 * Decides what to do with the clip for the current song position.
 * - paused song → pause the clip;
 * - clip not playing while the song is → play it, seeking first if it is lost;
 * - visible drift beyond the soft threshold → seek, then respect the cooldown.
 */
export function planVideoSync(
  target: VideoTarget,
  video: VideoState,
  options: SyncOptions = {},
): VideoCommand {
  if (!Number.isFinite(target.position)) return { type: 'none' };
  const offset = clampVideoOffset(options.offset ?? 0);
  const duration = options.duration ?? Number.POSITIVE_INFINITY;
  const now = options.now ?? 0;
  const hard = options.hardDrift ?? VIDEO_HARD_DRIFT_SECONDS;
  const soft = options.softDrift ?? VIDEO_SOFT_DRIFT_SECONDS;
  const wanted = Math.max(0, target.position + offset);

  if (!target.playing) return video.playing ? { type: 'pause' } : { type: 'none' };
  if (target.position > duration + 0.5) return video.playing ? { type: 'pause' } : { type: 'none' };
  if (!video.ready) return { type: 'none' };

  const drift = video.position - wanted;
  const magnitude = Math.abs(drift);
  const cooling = now < (options.cooldownUntil ?? 0);

  if (!video.playing) {
    // Starting from scratch: place the picture first if it is lost, then play.
    return magnitude > hard ? { type: 'seek-and-play', to: wanted } : { type: 'play' };
  }
  // A large drift is corrected even during the cooldown: a visible jump is worse.
  if (magnitude >= hard) return { type: 'seek', to: wanted };
  if (cooling) return { type: 'none' };
  if (magnitude >= soft) {
    // Video ahead of the song → slow it down; behind → speed it up.
    const rate = drift > 0 ? 1 - VIDEO_NUDGE_RATE : 1 + VIDEO_NUDGE_RATE;
    return video.rate === rate ? { type: 'none' } : { type: 'nudge', rate };
  }
  if (video.rate !== undefined && video.rate !== 1) return { type: 'nudge', rate: 1 };
  return { type: 'none' };
}

/** Progress bar value for the clip, so the UI never shows a negative time. */
export function videoDisplayTime(video: VideoState, offset = 0): number {
  return Math.max(0, video.position - clampVideoOffset(offset));
}

/**
 * Human-readable state for the backdrop: the interface uses this to explain a
 * paused, unavailable or drifting clip without guessing.
 */
export function videoStatusLabel(input: {
  enabled: boolean;
  ready: boolean;
  playing: boolean;
  muted: boolean;
  drift: number;
}): string {
  if (!input.enabled) return 'Video clip off';
  if (!input.ready) return 'Loading video clip';
  if (!input.playing) return 'Video clip paused';
  if (Math.abs(input.drift) >= VIDEO_HARD_DRIFT_SECONDS) return 'Resyncing video clip';
  return input.muted ? 'Video clip muted · audio from your file' : 'Video clip playing';
}
