import { describe, expect, it } from 'vitest';
import {
  BREAK_AFTER_SECONDS,
  BREAK_SNOOZE_SECONDS,
  breakDue,
  freshBreak,
  heardFor,
  nextBreakThreshold,
} from './breakTime';

describe('a long listening session', () => {
  it('counts only the seconds the music is running', () => {
    const state = heardFor(heardFor(freshBreak(), 60), 30);
    expect(state.listened).toBe(90);
    // A paused app reports nothing, and negative time never happens.
    expect(heardFor(state, 0).listened).toBe(90);
    expect(heardFor(state, -5).listened).toBe(90);
  });

  it('waits an hour and a half', () => {
    expect(breakDue({ listened: BREAK_AFTER_SECONDS - 1 })).toBe(false);
    expect(breakDue({ listened: BREAK_AFTER_SECONDS })).toBe(true);
  });

  it('gives more room each time the offer is declined', () => {
    const next = nextBreakThreshold(BREAK_AFTER_SECONDS);
    expect(next).toBe(BREAK_AFTER_SECONDS + BREAK_SNOOZE_SECONDS);
    expect(breakDue({ listened: BREAK_AFTER_SECONDS }, next)).toBe(false);
    // It never shortens, whatever it is handed.
    expect(nextBreakThreshold(10)).toBe(BREAK_AFTER_SECONDS);
  });
});
