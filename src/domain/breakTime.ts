/**
 * How long Wave lets someone listen before it mentions stopping.
 *
 * There is no cleverness in here on purpose. Wave counts the seconds it is
 * actually playing — pauses do not count, a locked phone does not count — and
 * once a session passes an hour and a half it says one short sentence and stops
 * the music. The sentence is an offer, not a scolding: one tap and the music
 * comes back.
 *
 * The interval repeats slower each time. Saying the same line every ninety
 * minutes would be a nag; saying it once would be a gimmick. Twenty minutes of
 * extra room each time it is dismissed means the second mention arrives during
 * a different part of the evening.
 */
export const BREAK_AFTER_SECONDS = 90 * 60;
/** How much longer the next mention waits when the listener keeps listening. */
export const BREAK_SNOOZE_SECONDS = 20 * 60;

export interface BreakState {
  /** Seconds of actual playing this session. */
  listened: number;
}

export function freshBreak(): BreakState {
  return { listened: 0 };
}

/** Counts only the time the music is really running. */
export function heardFor(state: BreakState, seconds: number): BreakState {
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  return { listened: state.listened + seconds };
}

/**
 * Is it time to mention it?
 *
 * `threshold` grows when the listener declines, so this stays a check about the
 * session and not a timer that fires on the clock.
 */
export function breakDue(state: BreakState, threshold = BREAK_AFTER_SECONDS): boolean {
  return Number.isFinite(threshold) && state.listened >= threshold;
}

/** The next threshold after the listener keeps listening. */
export function nextBreakThreshold(current: number): number {
  return Math.max(BREAK_AFTER_SECONDS, current + BREAK_SNOOZE_SECONDS);
}

/** The one line the listener reads, in the order they read it. */
export const BREAK_HEADLINE = 'Hey, wanna take a break?';
export const BREAK_BODY =
  'You have been listening for a while. The music is stopped — it will be here when you come back.';
