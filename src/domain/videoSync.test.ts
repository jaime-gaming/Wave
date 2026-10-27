import { describe, expect, it } from 'vitest';
import {
  clampVideoOffset,
  planVideoSync,
  VIDEO_HARD_DRIFT_SECONDS,
  VIDEO_OFFSET_LIMIT_SECONDS,
  videoDisplayTime,
  videoStatusLabel,
} from './videoSync';

const ready = (position: number, playing = true) => ({ position, playing, ready: true });

describe('video clip sync', () => {
  it('does nothing while the embed has not reported a state', () => {
    expect(
      planVideoSync({ position: 30, playing: true }, { position: 0, playing: false, ready: false }),
    ).toEqual({ type: 'none' });
  });

  it('pauses and resumes the clip with the song', () => {
    expect(planVideoSync({ position: 30, playing: false }, ready(30))).toEqual({ type: 'pause' });
    expect(planVideoSync({ position: 30, playing: false }, ready(30, false))).toEqual({
      type: 'none',
    });
    expect(planVideoSync({ position: 30, playing: true }, ready(30, false))).toEqual({
      type: 'play',
    });
  });

  it('seeks when the picture drifts visibly', () => {
    expect(planVideoSync({ position: 40, playing: true }, ready(38))).toEqual({
      type: 'seek',
      to: 40,
    });
    expect(planVideoSync({ position: 40, playing: true }, ready(42.5))).toEqual({
      type: 'seek',
      to: 40,
    });
    expect(planVideoSync({ position: 40, playing: true }, ready(40.1))).toEqual({ type: 'none' });
  });

  it('places a lost clip before starting it', () => {
    expect(planVideoSync({ position: 40, playing: true }, ready(20, false))).toEqual({
      type: 'seek-and-play',
      to: 40,
    });
  });

  it('respects the correction cooldown for small drift only', () => {
    const options = { now: 1_000, cooldownUntil: 5_000 };
    expect(planVideoSync({ position: 40, playing: true }, ready(39.5), options)).toEqual({
      type: 'none',
    });
    // A large drift is corrected even during the cooldown: silence is worse.
    expect(
      planVideoSync(
        { position: 40, playing: true },
        ready(40 - VIDEO_HARD_DRIFT_SECONDS - 0.1),
        options,
      ),
    ).toEqual({ type: 'seek', to: 40 });
  });

  it('applies the user offset and clamps it', () => {
    expect(clampVideoOffset(3.26)).toBe(3.3);
    expect(clampVideoOffset(-99)).toBe(-VIDEO_OFFSET_LIMIT_SECONDS);
    expect(clampVideoOffset(Number.NaN)).toBe(0);
    // A 0.3 s offset explains a 0.5 s difference, so no correction is needed.
    expect(planVideoSync({ position: 40, playing: true }, ready(40.5), { offset: 0.3 })).toEqual({
      type: 'none',
    });
    // Without the offset the same difference is visible and gets corrected.
    expect(planVideoSync({ position: 40, playing: true }, ready(40.5), { offset: -0.5 })).toEqual({
      type: 'seek',
      to: 39.5,
    });
    expect(planVideoSync({ position: 1, playing: true }, ready(0), { offset: -5 })).toEqual({
      type: 'none',
    });
  });

  it('stops the clip past the end of the song', () => {
    expect(planVideoSync({ position: 260, playing: true }, ready(200), { duration: 250 })).toEqual({
      type: 'pause',
    });
  });

  it('describes the state without pretending', () => {
    expect(
      videoStatusLabel({ enabled: false, ready: true, playing: true, muted: true, drift: 0 }),
    ).toBe('Video clip off');
    expect(
      videoStatusLabel({ enabled: true, ready: false, playing: false, muted: true, drift: 0 }),
    ).toBe('Loading video clip');
    expect(
      videoStatusLabel({ enabled: true, ready: true, playing: true, muted: true, drift: 0 }),
    ).toMatch(/audio from your file/);
    expect(
      videoStatusLabel({ enabled: true, ready: true, playing: true, muted: true, drift: 3 }),
    ).toBe('Resyncing video clip');
    expect(videoDisplayTime({ position: 10, playing: true, ready: true }, 2)).toBe(8);
    expect(videoDisplayTime({ position: 1, playing: true, ready: true }, 5)).toBe(0);
  });
});
