import type { EnergyEnvelope } from './musicEnergy';
export interface MixCues {
  start: number;
  end: number;
}

export function mixCues(envelope: EnergyEnvelope | undefined, duration: number): MixCues {
  const fallback = { start: 0, end: duration };
  if (!envelope || !Number.isFinite(duration) || duration < 8) return fallback;
  const { values, step } = envelope;
  if (
    !Number.isFinite(step) ||
    step <= 0 ||
    !values.length ||
    values.length * step < duration - step * 2 ||
    !values.every(Number.isFinite)
  )
    return fallback;
  const first = values.findIndex((value) => value > 0.003);
  if (first < 0) return fallback;
  let last = values.length - 1;
  while (last >= first && values[last] <= 0.003) last--;
  const start = Math.min(4, Math.max(0, first * step - 0.15)),
    end = Math.max(duration - 4, Math.min(duration, (last + 1) * step + 0.2));
  return { start: start >= 0.35 ? start : 0, end: duration - end >= 0.35 ? end : duration };
}

// A planned entry can precede the end-minus-overlap point after snapping to a bar.
// Wake the scheduler in time for that entry, not just for the fade length.
export function plannedMixWindow(fallback: number, playbackEnd: number, startAt?: number): number {
  const base = Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
  if (!Number.isFinite(playbackEnd) || !Number.isFinite(startAt)) return base;
  return Math.max(base, playbackEnd - startAt!);
}

export const MIN_MIX_TAIL = 12;

export function mixWindowReached(currentTime: number, duration: number, window: number) {
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    currentTime < 0 ||
    currentTime > duration
  )
    return false;
  const tail = Math.min(
    duration / 2,
    Math.max(MIN_MIX_TAIL, (Number.isFinite(window) ? window : 0) + 2),
  );
  return duration - currentTime <= tail;
}

export const MIX_FLOOR_SECONDS = 12;
export const MIX_CEILING_SECONDS = 24;

export function automaticMixSeconds(outgoing: number, incoming: number) {
  if (!Number.isFinite(outgoing) || !Number.isFinite(incoming) || outgoing <= 0 || incoming <= 0)
    return 0;
  const shortest = Math.min(outgoing, incoming);

  return Math.min(
    MIX_CEILING_SECONDS,
    Math.max(Math.min(MIX_FLOOR_SECONDS, shortest / 4), shortest * 0.12),
    shortest / 2,
  );
}
