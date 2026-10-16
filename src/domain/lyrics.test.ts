import { describe, it, expect } from 'vitest';
import { parseLyrics, activeLyricIndex, embeddedLyrics } from './lyrics';
describe('local lyric clocks', () => {
  it('parses BOM, repeated timestamps, fractions, metadata and LRC offset without guessing', () => {
    const value = parseLyrics(
      '\uFEFF[ar:Artist]\n[offset:100]\n[00:02.50][01:03.005]Line\n[00:01.000]Earlier\n[00:04.000]',
    );
    expect(value.lines).toEqual([
      { text: 'Earlier', time: 0.9 },
      { text: 'Line', time: 2.4 },
      { text: '', time: 3.9 },
      { text: 'Line', time: 62.905 },
    ]);
  });
  it('finds the exact active line before/at boundaries, backward seeks, and user offsets', () => {
    const value = parseLyrics('[00:01.000]A\n[00:02.000]B', 500);
    expect(activeLyricIndex(value, 1.499)).toBe(-1);
    expect(activeLyricIndex(value, 1.5)).toBe(0);
    expect(activeLyricIndex(value, 2.5)).toBe(1);
    expect(activeLyricIndex(value, 1.6)).toBe(0);
    expect(activeLyricIndex(value, NaN)).toBe(-1);
  });
  it('does not fabricate timing for plain lyrics or MPEG-frame tags', () => {
    const plain = parseLyrics('First\nSecond');
    expect(plain.lines.every((line) => line.time === undefined)).toBe(true);
    expect(activeLyricIndex(plain, 5)).toBe(-1);
    expect(
      embeddedLyrics([{ timeStampFormat: 1, syncText: [{ text: 'Frame lyric', timestamp: 100 }] }])
        ?.lines,
    ).toEqual([{ text: 'Frame lyric' }]);
  });
  it('converts embedded millisecond timestamps and preserves embedded unsynced text', () => {
    expect(
      embeddedLyrics([{ timeStampFormat: 2, syncText: [{ text: 'One', timestamp: 1500 }] }])?.lines,
    ).toEqual([{ text: 'One', time: 1.5 }]);
    expect(embeddedLyrics([{ text: 'Only words' }])?.source).toBe('embedded');
  });
  it('rejects oversized text, excessive lines and invalid offsets', () => {
    expect(() => parseLyrics('a'.repeat(100001))).toThrow();
    expect(() => parseLyrics('a', Infinity)).toThrow();
    expect(() => parseLyrics('[offset:999999]\n[00:01]A')).toThrow();
    expect(() => parseLyrics('a\n'.repeat(2001))).toThrow();
  });
});
it('interpolates visual text fill using real line boundaries, offsets and final duration', async () => {
  const { lyricFillProgress } = await import('./lyrics');
  const lyrics = parseLyrics('[00:00]First line\n[00:04]Second line\n[00:08]Last line');
  expect(lyricFillProgress(lyrics, 2, 12)).toBe(0.5);
  expect(lyricFillProgress(lyrics, 4, 12)).toBe(0);
  expect(lyricFillProgress(lyrics, 10, 12)).toBe(0.5);
  expect(lyricFillProgress(lyrics, 12, 12)).toBe(1);
  expect(lyricFillProgress({ ...lyrics, offsetMs: 1000 }, 3, 12)).toBe(0.5);
  expect(lyricFillProgress({ ...lyrics, offsetMs: 1000 }, 0.5, 12)).toBe(0);
  expect(lyricFillProgress(lyrics, NaN, 12)).toBe(0);
  expect(lyricFillProgress(parseLyrics('Plain text'), 2, 12)).toBe(0);
  expect(lyricFillProgress(lyrics, 8)).toBe(1);
});
it('preserves Unicode text and whitespace in ordered visual-fill tokens', async () => {
  const { lyricFillTokens } = await import('./lyrics');
  const text = 'Hola  🎵 mundo';
  const tokens = lyricFillTokens(text);
  expect(tokens.map((token) => token.text).join('')).toBe(text);
  expect(tokens[0].start).toBe(0);
  expect(tokens.at(-1)?.end).toBe(1);
  expect(tokens[2].end - tokens[2].start).toBeCloseTo(1 / Array.from(text).length);
});
it('preserves supplied enhanced-LRC word timestamps and applies offsets to every segment', async () => {
  const { timedWordProgress, validLyricTimeline } = await import('./lyrics');
  const lyrics = parseLyrics('[offset:100]\n[00:01]<00:01>Hello <00:02>world<00:03>');
  expect(lyrics.lines[0]).toMatchObject({
    time: 0.9,
    text: 'Hello world',
    words: [
      { text: 'Hello ', time: 0.9, end: 1.9 },
      { text: 'world', time: 1.9, end: 2.9 },
    ],
  });
  expect(timedWordProgress(lyrics.lines[0].words![0], 1.4, 0)).toBeCloseTo(0.5);
  expect(timedWordProgress(lyrics.lines[0].words![0], 1.9, 500)).toBeCloseTo(0.5);
  expect(validLyricTimeline(lyrics, 2)).toBe(false);
  expect(validLyricTimeline(lyrics, 4)).toBe(true);
});
it('shifts word stamps for repeated line stamps and avoids pretending ordinary LRC has word timing', () => {
  const lyrics = parseLyrics('[00:01][00:11]<00:01>Hello<00:02>');
  expect(lyrics.lines[1].words?.[0]).toMatchObject({ time: 11, end: 12 });
  expect(parseLyrics('[00:01]Hello world').lines[0].words).toBeUndefined();
  expect(parseLyrics('[00:01]<00:00>Wrong<00:02>').lines[0].words).toBeUndefined();
});
it('parses single-digit seconds, comma fractions, spaced header offsets and old Mac line endings', () => {
  const lyrics = parseLyrics('[offset: +500 ]\r[00:1,50]First\r[00:03.00]Second');
  expect(lyrics.lines).toEqual([
    { time: 1, text: 'First' },
    { time: 2.5, text: 'Second' },
  ]);
  expect(() => parseLyrics('[offset: 10001 ]\n[00:01]Bad')).toThrow();
});
