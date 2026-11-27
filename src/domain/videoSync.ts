export const VIDEO_HARD_DRIFT_SECONDS = 1.1;

export const VIDEO_SOFT_DRIFT_SECONDS = 0.15;
export const VIDEO_NUDGE_RATE = 0.1;
export const VIDEO_CORRECTION_COOLDOWN_MS = 4_000;

export const VIDEO_OFFSET_LIMIT_SECONDS = 10;

export interface VideoTarget {
  position: number;
  playing: boolean;
}

export interface VideoState {
  position: number;
  playing: boolean;

  ready: boolean;

  rate?: number;
}

export interface SyncOptions {
  offset?: number;

  startAt?: number;

  clipLength?: number;

  duration?: number;
  now?: number;

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
  | { type: 'nudge'; rate: number };

export const clampVideoOffset = (seconds: number): number => {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(
    VIDEO_OFFSET_LIMIT_SECONDS,
    Math.max(-VIDEO_OFFSET_LIMIT_SECONDS, Math.round(seconds * 10) / 10),
  );
};

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

  const startAt =
    typeof options.startAt === 'number' && Number.isFinite(options.startAt)
      ? Math.max(-86_400, Math.min(86_400, options.startAt))
      : 0;
  const wanted = fitClipTime(
    target.position + startAt + offset,
    Math.max(0, startAt),
    options.clipLength,
  );

  if (!target.playing) return video.playing ? { type: 'pause' } : { type: 'none' };
  if (target.position > duration + 0.5) return video.playing ? { type: 'pause' } : { type: 'none' };
  if (!video.ready) return { type: 'none' };

  const drift = video.position - wanted;
  const magnitude = Math.abs(drift);
  const cooling = now < (options.cooldownUntil ?? 0);

  if (!video.playing) {
    return magnitude > hard ? { type: 'seek-and-play', to: wanted } : { type: 'play' };
  }

  if (magnitude >= hard) return { type: 'seek', to: wanted };
  if (cooling) return { type: 'none' };
  if (magnitude >= soft) {
    const rate = drift > 0 ? 1 - VIDEO_NUDGE_RATE : 1 + VIDEO_NUDGE_RATE;
    return video.rate === rate ? { type: 'none' } : { type: 'nudge', rate };
  }
  if (video.rate !== undefined && video.rate !== 1) return { type: 'nudge', rate: 1 };
  return { type: 'none' };
}

export function fitClipTime(time: number, startAt = 0, clipLength?: number): number {
  if (!Number.isFinite(time)) return 0;

  const from = Number.isFinite(startAt) ? startAt : 0;
  const length = Number.isFinite(clipLength) ? (clipLength as number) : 0;
  const span = length - from;
  if (length <= 0 || span <= 5 || time < length) return Math.max(0, time);
  return from + ((time - from) % span);
}

export function videoDisplayTime(video: VideoState, offset = 0): number {
  return Math.max(0, video.position - clampVideoOffset(offset));
}

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
