import type { EnergyEnvelope } from './musicEnergy';
import type { MixCues } from './mix';

/**
 * Crossfade planning in the style of Apple Music.
 *
 * Apple's crossfade is a plain equal-power overlap of a user-chosen length: the
 * next song starts `seconds` before the current one ends and both play together
 * on a cosine/sine curve. Wave keeps its existing staged "blend" for people who
 * like it, and adds this as the default Mix.
 *
 * Gain scheduling never touches sample data: both songs still play from their
 * original, unmodified files. Only `HTMLMediaElement.volume` changes, so a
 * lossless file stays lossless and a lossy file is never re-encoded.
 */
export type MixStyle = 'crossfade' | 'blend';
export const CROSSFADE_MIN_SECONDS = 1;
export const CROSSFADE_MAX_SECONDS = 12;
export const CROSSFADE_DEFAULT_SECONDS = 6;

export function clampCrossfadeSeconds(value: number): number {
  if (!Number.isFinite(value)) return CROSSFADE_DEFAULT_SECONDS;
  return Math.min(
    CROSSFADE_MAX_SECONDS,
    Math.max(CROSSFADE_MIN_SECONDS, Math.round(value * 2) / 2),
  );
}

/** Equal-power curve: constant perceived loudness across the overlap. */
export function crossfadeGains(progress: number): { outgoing: number; incoming: number } {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return {
    outgoing: Math.cos((p * Math.PI) / 2),
    incoming: Math.sin((p * Math.PI) / 2),
  };
}

export interface CrossfadePlan {
  /** Overlap length actually used, in seconds. */
  seconds: number;
  /** Position in the outgoing song where the overlap must begin. */
  startAt: number;
  /** Position in the incoming song where playback starts. */
  cue: number;
}

/**
 * Places the overlap inside audible audio instead of trailing silence, and never
 * lets the fade swallow more than half of either recording.
 */
export function planCrossfade(input: {
  outgoingDuration: number;
  incomingDuration: number;
  outgoingCues?: MixCues;
  incomingCues?: MixCues;
  requestedSeconds?: number;
}): CrossfadePlan {
  const outgoing = Number.isFinite(input.outgoingDuration)
    ? Math.max(0, input.outgoingDuration)
    : 0;
  const incoming = Number.isFinite(input.incomingDuration)
    ? Math.max(0, input.incomingDuration)
    : 0;
  const outCues = input.outgoingCues ?? { start: 0, end: outgoing };
  const inCues = input.incomingCues ?? { start: 0, end: incoming };
  const requested = clampCrossfadeSeconds(input.requestedSeconds ?? CROSSFADE_DEFAULT_SECONDS);
  const audibleTail = Math.max(0, outCues.end - outCues.start);
  const audibleHead = Math.max(0, inCues.end - inCues.start);
  let seconds = Math.min(requested, audibleTail, audibleHead / 2);
  if (seconds < CROSSFADE_MIN_SECONDS || audibleTail < CROSSFADE_MIN_SECONDS) seconds = 0;
  seconds = Math.round(seconds * 100) / 100;
  const startAt = Math.max(outCues.start, (outCues.end || outgoing) - seconds);
  return { seconds, startAt, cue: Math.max(0, inCues.start) };
}

/**
 * Suggests a length from the tail energy: a song that fades out quietly tolerates
 * a longer overlap than one that ends on a hard hit. Bounded by the user setting.
 */
export function suggestCrossfadeSeconds(
  envelope: EnergyEnvelope | undefined,
  duration: number,
  requested = CROSSFADE_DEFAULT_SECONDS,
): number {
  const base = clampCrossfadeSeconds(requested);
  if (!envelope || !Number.isFinite(duration) || duration < 10) return base;
  const { values, step } = envelope;
  const tail = Math.max(0, Math.floor((duration - 8) / step));
  let sum = 0;
  let count = 0;
  for (let index = tail; index < values.length; index++) {
    sum += values[index];
    count++;
  }
  if (!count) return base;
  const average = sum / count;
  // Quiet endings can overlap longer, loud endings stay short so no lyric is cut.
  const factor = average < 0.05 ? 1.35 : average > 0.3 ? 0.6 : 1;
  return clampCrossfadeSeconds(Math.min(base * factor, CROSSFADE_MAX_SECONDS));
}

/** Progress of the overlap from the incoming song's own clock. */
export function crossfadeProgress(cue: number, seconds: number, currentTime: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(0, Math.min(1, (currentTime - cue) / seconds));
}
