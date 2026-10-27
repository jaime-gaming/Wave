import { describe, expect, it } from 'vitest';
import { parseLyrics } from './lyrics';
import {
  activeWordIndex,
  deriveWordTimings,
  hasProviderWordTiming,
  karaokeWords,
  MIN_WORD_SECONDS,
  pauseWeight,
  splitWords,
  syllableWeight,
  wordProgress,
} from './wordTiming';

describe('word-by-word lyrics', () => {
  it('counts syllables roughly and weights punctuation pauses', () => {
    expect(syllableWeight('love')).toBe(1);
    expect(syllableWeight('beautiful')).toBeGreaterThan(2);
    expect(syllableWeight('!!')).toBe(1);
    expect(pauseWeight('word,')).toBeGreaterThan(pauseWeight('word'));
    expect(pauseWeight('end.')).toBeGreaterThan(pauseWeight('end,'));
    expect(pauseWeight('plain')).toBe(1);
  });

  it('splits a line into words without losing a character', () => {
    const text = '  Hello,   cruel   world! ';
    const tokens = splitWords(text);
    expect(tokens.map((token) => token.text)).toEqual(['Hello,', 'cruel', 'world!']);
    expect(tokens.map((token) => `${token.leading}${token.text}${token.trailing}`).join('')).toBe(
      text,
    );
  });

  it('derives monotonic, non-overlapping word times inside the line', () => {
    const words = deriveWordTimings('We were young and we were free', 10, 14);
    expect(words).toHaveLength(7);
    expect(words[0].start).toBe(10);
    expect(words.at(-1)!.end).toBeCloseTo(14, 1);
    for (let index = 1; index < words.length; index++) {
      expect(words[index].start).toBeGreaterThanOrEqual(words[index - 1].end - 1e-9);
    }
    for (const word of words) {
      expect(word.end - word.start).toBeGreaterThanOrEqual(MIN_WORD_SECONDS - 1e-9);
      expect(word.source).toBe('derived');
    }
  });

  it('is deterministic and gives more time to longer words', () => {
    const a = deriveWordTimings('extraordinary day', 0, 2);
    const b = deriveWordTimings('extraordinary day', 0, 2);
    expect(a).toEqual(b);
    expect(a[0].end - a[0].start).toBeGreaterThan(a[1].end - a[1].start);
  });

  it('falls back to a sensible span when the line has no end', () => {
    const words = deriveWordTimings('one two three', 5, Number.NaN);
    expect(words[0].start).toBe(5);
    expect(words.at(-1)!.end).toBeGreaterThan(5.5);
  });

  it('prefers provider word timestamps and marks the source', () => {
    const lyrics = parseLyrics(
      '[00:10.00]<00:10.00>Hold <00:10.60>on <00:11.20>tight\n[00:14.00]Next line',
    );
    const first = lyrics.lines[0];
    const words = karaokeWords(first, lyrics.lines[1].time);
    expect(words.map((word) => word.text)).toEqual(['Hold ', 'on ', 'tight']);
    expect(words[1]).toMatchObject({ start: 10.6, source: 'provider' });
    expect(hasProviderWordTiming(words)).toBe(true);
  });

  it('derives words for ordinary synced lyrics and labels them as an estimate', () => {
    const lyrics = parseLyrics('[00:10.00]Hold on tight\n[00:14.00]Next line');
    const words = karaokeWords(lyrics.lines[0], lyrics.lines[1].time);
    expect(words).toHaveLength(3);
    expect(words[0].start).toBe(10);
    expect(words.at(-1)!.end).toBe(14);
    expect(hasProviderWordTiming(words)).toBe(false);
    expect(karaokeWords({ text: 'unsynced' })).toEqual([]);
  });

  it('computes per-word fill and the active word', () => {
    const words = deriveWordTimings('hold on tight', 0, 3);
    expect(wordProgress(words[0], -1)).toBe(0);
    expect(wordProgress(words[0], words[0].start)).toBe(0);
    expect(wordProgress(words[0], (words[0].start + words[0].end) / 2)).toBeCloseTo(0.5, 5);
    expect(wordProgress(words[0], 99)).toBe(1);
    expect(wordProgress({ ...words[0], end: words[0].start }, 99)).toBe(1);

    expect(activeWordIndex(words, 0)).toBe(0);
    expect(activeWordIndex(words, words[1].start + 0.001)).toBe(1);
    expect(activeWordIndex(words, -5)).toBe(-1);
    expect(activeWordIndex([], 1)).toBe(-1);
  });
});
