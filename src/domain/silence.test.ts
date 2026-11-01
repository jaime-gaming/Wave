import { describe, expect, it } from 'vitest';
import {
  describeSilence,
  playableBounds,
  silenceReport,
  trimFromReport,
  SILENCE_MARGIN,
} from './silence';

const analysis = (start: number, end: number, duration = 200) => ({
  duration,
  trimmed: { start, end },
});

describe('dead air at the edges of a file', () => {
  it('measures both ends against the whole file', () => {
    const report = silenceReport(analysis(2.4, 190))!;
    expect(report.leading).toBe(2.4);
    expect(report.trailing).toBe(10);
    expect(report.worth).toBe(true);
  });

  it('says nothing about a recording that starts and stops with the music', () => {
    expect(silenceReport(analysis(0.1, 199.4))!.worth).toBe(false);
    expect(silenceReport(undefined)).toBeNull();
  });

  it('keeps a margin so a trim never shaves the playing', () => {
    const trim = trimFromReport(silenceReport(analysis(2.4, 190))!);
    // Rounded to a tenth of a second, then pulled back by the margin.
    expect(trim.start).toBe(2.2);
    expect(trim.end).toBe(190.3);
    expect(trim.start).toBeLessThan(2.4 - SILENCE_MARGIN + 0.1);
    expect(trim.end).toBeGreaterThan(190);
  });

  it('plays a trimmed song between its bounds and an untrimmed one to the end', () => {
    expect(playableBounds(200, { start: 3, end: 190 })).toEqual({ start: 3, end: 190 });
    expect(playableBounds(200, undefined)).toEqual({ start: 0, end: 200 });
    // Bounds that make no sense still leave a song that plays.
    expect(playableBounds(200, { start: 400, end: 100 })).toEqual({ start: 200, end: 200 });
    expect(playableBounds(0, { start: 3, end: 190 })).toEqual({ start: 0, end: 0 });
  });

  it('describes the silence the way someone would say it', () => {
    expect(describeSilence(silenceReport(analysis(2.4, 190))!)).toBe(
      '2.4 seconds of silence at the start and 10 seconds at the end',
    );
    expect(describeSilence(silenceReport(analysis(0, 194))!)).toBe(
      '6.0 seconds of silence at the end',
    );
    expect(describeSilence(silenceReport(analysis(3, 199))!)).toBe(
      '3.0 seconds of silence at the start',
    );
  });
});
