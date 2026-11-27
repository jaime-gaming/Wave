export const BREAK_AFTER_SECONDS = 90 * 60;

export const BREAK_SNOOZE_SECONDS = 20 * 60;

export interface BreakState {
  listened: number;
}

export function freshBreak(): BreakState {
  return { listened: 0 };
}

export function heardFor(state: BreakState, seconds: number): BreakState {
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  return { listened: state.listened + seconds };
}

export function breakDue(state: BreakState, threshold = BREAK_AFTER_SECONDS): boolean {
  return Number.isFinite(threshold) && state.listened >= threshold;
}

export function nextBreakThreshold(current: number): number {
  return Math.max(BREAK_AFTER_SECONDS, current + BREAK_SNOOZE_SECONDS);
}

export const BREAK_HEADLINE = 'Time for a little pause?';
export const BREAK_BODY =
  'Your music is paused. Take a moment, or keep listening whenever you like.';
