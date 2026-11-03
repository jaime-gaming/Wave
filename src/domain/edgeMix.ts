/**
 * Handovers that involve a YouTube song.
 *
 * A YouTube song has no local bytes, so Wave cannot analyse its tempo, align
 * beats or stretch it. What it *can* do is crossfade, and that is what this
 * module plans: a short equal-power window sized from the two durations, with
 * gains that the player applies to the embed's volume and to the local deck at
 * the same time.
 *
 * The result is honest: "crossfade" in the plan notes, never "beatmatched".
 */
export const EDGE_MIN_SECONDS = 2.5;
export const EDGE_MAX_SECONDS = 8;

export interface EdgeHandover {
  seconds: number;
  notes: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Window for a handover where at least one side is a YouTube song.
 *
 * Longer songs get a longer window, but never more than a quarter of either
 * song: a crossfade that eats the intro of a 60-second clip is worse than a
 * short one. Unknown durations fall back to the minimum.
 */
export function planEdgeHandover(
  outgoingSeconds: number,
  incomingSeconds: number,
  options: { minSeconds?: number; maxSeconds?: number } = {},
): EdgeHandover {
  const min = Math.max(1, options.minSeconds ?? EDGE_MIN_SECONDS);
  const max = Math.max(min, options.maxSeconds ?? EDGE_MAX_SECONDS);
  const durations = [outgoingSeconds, incomingSeconds].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (!durations.length) return { seconds: min, notes: ['Length unknown: shortest overlap.'] };
  const shortest = Math.min(...durations);
  const seconds = clamp(Math.min(max, shortest / 4), min, Math.max(min, shortest));
  return {
    seconds: Math.round(seconds * 100) / 100,
    notes: [
      shortest / 4 < min
        ? 'One of the songs is short, so the overlap is kept small.'
        : 'Crossfade: a YouTube song cannot be beat matched.',
    ],
  };
}

/** Equal-power gains, identical to the local path so the two sides match. */
export function edgeGains(progress: number): { outgoing: number; incoming: number } {
  const p = clamp(progress, 0, 1);
  return { outgoing: Math.cos((p * Math.PI) / 2), incoming: Math.sin((p * Math.PI) / 2) };
}

/** Remaining seconds of a song, tolerant of a missing duration. */
export function edgeRemaining(duration: number, position: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, duration - (Number.isFinite(position) ? position : 0));
}
