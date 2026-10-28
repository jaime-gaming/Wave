import { describe, expect, it } from 'vitest';
import {
  clampVideoOffset,
  fitClipTime,
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

  it('nudges the clip rate for small drift instead of jumping the picture', () => {
    // Picture behind the song: play it a little faster.
    expect(planVideoSync({ position: 40, playing: true }, ready(39.6))).toEqual({
      type: 'nudge',
      rate: 1.1,
    });
    // Picture ahead: slow it down.
    expect(planVideoSync({ position: 40, playing: true }, ready(40.4))).toEqual({
      type: 'nudge',
      rate: 0.9,
    });
    // Already nudging at the right rate: stay quiet.
    expect(planVideoSync({ position: 40, playing: true }, { ...ready(39.6), rate: 1.1 })).toEqual({
      type: 'none',
    });
    // Back in sync: return the clip to normal speed.
    expect(planVideoSync({ position: 40, playing: true }, { ...ready(40), rate: 1.1 })).toEqual({
      type: 'nudge',
      rate: 1,
    });
  });

  it('places a lost clip before starting it', () => {
    expect(planVideoSync({ position: 40, playing: true }, ready(20, false))).toEqual({
      type: 'seek-and-play',
      to: 40,
    });
  });

  it('respects the correction cooldown for small drift only', () => {
    const options = { now: 1_000, cooldownUntil: 5_000 };
    // While cooling down after a seek the clip is left alone, whatever the drift.
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
    // A 0.5 s offset explains the difference exactly, so no correction is needed.
    expect(planVideoSync({ position: 40, playing: true }, ready(40.5), { offset: 0.5 })).toEqual({
      type: 'none',
    });
    // Without the offset the same difference is corrected by rate, not a seek.
    expect(planVideoSync({ position: 40, playing: true }, ready(40.5), { offset: -0.5 })).toEqual({
      type: 'nudge',
      rate: 0.9,
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

describe('fitting the picture to the song', () => {
  it('aims at the placed start of the clip, not at the beginning of the upload', () => {
    // The music starts 18 s into the upload: at 30 s of the song the picture
    // belongs at 48 s, and it is not treated as drift.
    expect(
      planVideoSync({ position: 30, playing: true }, ready(48), {
        startAt: 18,
        duration: 240,
        now: 0,
      }),
    ).toEqual({ type: 'none' });
    expect(
      planVideoSync({ position: 30, playing: true }, ready(30), {
        startAt: 18,
        duration: 240,
        now: 0,
      }),
    ).toEqual({ type: 'seek', to: 48 });
  });

  it('does not clamp the placement like a manual nudge', () => {
    // 45 s in is beyond the manual offset limit; a placement is free to go there.
    expect(fitClipTime(10, 45)).toBe(10);
    expect(
      planVideoSync({ position: 10, playing: true }, ready(0), {
        startAt: 45,
        duration: 240,
        now: 0,
      }),
    ).toEqual({ type: 'seek', to: 55 });
  });

  it('starts the picture again when the clip is shorter than the song', () => {
    expect(fitClipTime(10, 0, 180)).toBe(10);
    // Past the end of the video, aim back inside it instead of beyond.
    expect(fitClipTime(200, 6, 180)).toBe(26);
    expect(fitClipTime(380, 0, 180)).toBe(20);
    // Unknown or negligible lengths change nothing.
    expect(fitClipTime(200, 0)).toBe(200);
    expect(fitClipTime(200, 0, 3)).toBe(200);
  });
});
