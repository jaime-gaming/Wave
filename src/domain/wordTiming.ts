import type { LyricLine } from './lyrics';

/**
 * Word-by-word lyric timing.
 *
 * Two sources, never confused:
 * - `provider`: the file or provider supplied real word timestamps (enhanced
 *   LRC `<mm:ss.xx>` inside a line, or millisecond SYLT). Those are exact.
 * - `derived`: the line only has a start/end, so Wave distributes the word times
 *   across it by syllable count with punctuation pauses. It is an estimate, it is
 *   labelled as one in the interface, and it is deterministic so a line never
 *   jumps between renders.
 *
 * Nothing here changes stored lyrics or audio; it only computes display timing.
 */
export interface KaraokeWord {
  text: string;
  start: number;
  end: number;
  source: 'provider' | 'derived';
  /** Trailing pause weight applied after this word (punctuation). */
  pauseAfter: number;
}

export const MIN_WORD_SECONDS = 0.06;

const VOWELS = /[aeiouyáéíóúüàèìòùâêîôûäëïöüãõ]+/giu;
const round = (value: number) => Math.round(value * 1000) / 1000;
const PAUSE_WEIGHTS: Record<string, number> = {
  ',': 2.6,
  ';': 2.6,
  ':': 2.6,
  '.': 3.4,
  '!': 3.4,
  '?': 3.4,
  '…': 3.4,
  '-': 1.8,
};

/**
 * Rough syllable count used only to distribute durations, not to display.
 * Vowel groups approximate singing syllables; a silent final "e" is discounted
 * so "love" is not treated as two syllables.
 */
export function syllableWeight(text: string): number {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return 1;
  const groups = letters.match(VOWELS)?.length ?? 0;
  const silentE =
    letters.length > 3 && /[^aeiouy]e$/iu.test(letters) && !/le$/iu.test(letters) ? 1 : 0;
  const estimate = groups - silentE;
  return Math.max(1, Math.min(6, estimate || Math.ceil(letters.length / 3)));
}

export function pauseWeight(text: string): number {
  const last = text.trimEnd().slice(-1);
  return PAUSE_WEIGHTS[last] ?? 1;
}

interface Token {
  text: string;
  leading: string;
  trailing: string;
  weight: number;
  pause: number;
}

/**
 * Splits a line into words while preserving every character of the original:
 * leading spaces stay with the following word and trailing spaces with the last
 * one, so concatenating `leading + text + trailing` rebuilds the input exactly.
 */
export function splitWords(text: string): Token[] {
  const tokens: Token[] = [];
  let pending = '';
  for (const raw of text.split(/(\s+)/u)) {
    if (!raw) continue;
    if (!raw.trim()) {
      if (tokens.length) tokens[tokens.length - 1].trailing += raw;
      else pending += raw;
      continue;
    }
    const leading = pending;
    pending = '';
    tokens.push({
      text: raw,
      leading,
      trailing: '',
      weight: syllableWeight(raw),
      pause: pauseWeight(raw),
    });
  }
  return tokens;
}

/**
 * Distributes `[start, end)` across the words of a line. Words receive time in
 * proportion to syllables, plus a share of their trailing pause, so the highlight
 * lands on the beat of the next word instead of drifting ahead.
 */
export function deriveWordTimings(text: string, start: number, end: number): KaraokeWord[] {
  const tokens = splitWords(text);
  if (!tokens.length) return [];
  const from = Number.isFinite(start) ? Math.max(0, start) : 0;
  const span = Number.isFinite(end) && end > from ? end - from : Math.max(1, tokens.length * 0.28);
  const total = tokens.reduce(
    (sum, token) => sum + token.weight * (1 + (token.pause - 1) * 0.5),
    0,
  );
  let cursor = from;
  return tokens.map((token) => {
    const share = (token.weight * (1 + (token.pause - 1) * 0.5)) / total;
    const duration = Math.max(MIN_WORD_SECONDS, span * share);
    const word: KaraokeWord = {
      text: `${token.leading}${token.text}${token.trailing}`,
      start: Math.round(cursor * 1000) / 1000,
      end: Math.round((cursor + duration) * 1000) / 1000,
      source: 'derived',
      pauseAfter: token.pause,
    };
    cursor += duration;
    return word;
  });
}

/**
 * Word timing for a line. Provider timestamps win; every other synced line is
 * derived once so the interface can highlight word by word.
 */
export function karaokeWords(
  line: LyricLine,
  nextLineTime?: number,
  fallbackEnd?: number,
): KaraokeWord[] {
  if (line.time === undefined) return [];
  if (line.words?.length) {
    return line.words.map((word, index) => {
      const next = line.words![index + 1];
      const start = round(Math.max(0, word.time));
      const end = round(word.end ?? next?.time ?? nextLineTime ?? start + 0.4);
      return {
        text: word.text,
        start,
        end: Math.max(round(start + MIN_WORD_SECONDS), end),
        source: 'provider' as const,
        pauseAfter: pauseWeight(word.text),
      };
    });
  }
  const end = nextLineTime ?? fallbackEnd ?? line.time + Math.max(1, line.text.length * 0.06);
  return deriveWordTimings(line.text, line.time, end);
}

/** 0–1 progress inside one word; `1` once the word is over. */
export function wordProgress(word: KaraokeWord, clock: number): number {
  if (!Number.isFinite(clock)) return 0;
  if (clock <= word.start) return 0;
  if (clock >= word.end) return 1;
  const span = word.end - word.start;
  return span <= 0 ? 1 : Math.max(0, Math.min(1, (clock - word.start) / span));
}

export function activeWordIndex(words: KaraokeWord[], clock: number): number {
  if (!words.length || !Number.isFinite(clock)) return -1;
  let low = 0;
  let high = words.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (words[mid].start <= clock) {
      result = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return result;
}

/** True when every word carries real provider timestamps. */
export function hasProviderWordTiming(words: KaraokeWord[]): boolean {
  return words.length > 0 && words.every((word) => word.source === 'provider');
}
