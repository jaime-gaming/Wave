import type { EnergyEnvelope } from './musicEnergy';
export interface MixCues {
  start: number;
  end: number;
}
/** Only near-digital silence is skipped; quiet introductions remain intact. */
export function mixCues(envelope: EnergyEnvelope | undefined, duration: number): MixCues {
  const fallback = { start: 0, end: duration };
  if (!envelope || !Number.isFinite(duration) || duration < 8) return fallback;
  const { values, step } = envelope;
  const first = values.findIndex((value) => value > 0.003);
  if (first < 0) return fallback;
  let last = values.length - 1;
  while (last >= first && values[last] <= 0.003) last--;
  const start = Math.min(4, Math.max(0, first * step - 0.15)),
    end = Math.max(duration - 4, Math.min(duration, (last + 1) * step + 0.2));
  return { start: start >= 0.35 ? start : 0, end: duration - end >= 0.35 ? end : duration };
}
/**
 * The most a mix may start before the end of the *file*, whatever the analysis
 * believes the audible end to be. A handover that begins earlier is not a mix,
 * it is skipping the song, and it is the worst thing the feature can do.
 */
export const MIN_MIX_TAIL = 12;

/** True only inside the final seconds of a song, where a handover belongs. */
export function mixWindowReached(currentTime: number, duration: number, window: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return false;
  const tail = Math.max(MIN_MIX_TAIL, (Number.isFinite(window) ? window : 0) + 2);
  return duration - currentTime <= tail;
}

/**
 * Overlap used when there is no usable plan.
 *
 * This used to shrink with the square root of the song and stop at eight
 * seconds, so a handover between two songs the analysis could not read was a
 * short fade — the exact thing Mix is supposed to replace. A real song now gets
 * the same length the planner aims for; a very short file still gets a short
 * overlap, and neither deck is ever faded for more than half its playing time.
 */
export function automaticMixSeconds(outgoing: number, incoming: number) {
  if (!Number.isFinite(outgoing) || !Number.isFinite(incoming) || outgoing <= 0 || incoming <= 0)
    return 0;
  const shortest = Math.min(outgoing, incoming);
  return Math.min(16, Math.max(4, shortest * 0.1), shortest / 2);
}
