import type { LyricLine } from './lyrics';

/**
 * Word-level lyric formats used by the extra providers.
 *
 * Two shapes exist in the wild and both are worth reading, because they are the
 * only realistic source of real (not estimated) word timestamps for a local
 * file:
 *
 * - **YRC** (NetEase): `[lineStart,lineLength,0](wordStart,wordLength,0)word…`
 * - **KRC** (Kugou): `[lineStart,lineLength]<startOffset,length,0>word…`,
 *   delivered base64-encoded and XOR-obfuscated.
 *
 * Both are parsed into the same `LyricLine[]` the app already understands, with
 * `words[]` filled in. Anything inconsistent is dropped rather than guessed: a
 * line with non-monotonic word times falls back to its line time only.
 */

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * NetEase YRC. Lines are `[start,length,0]` and each word carries its own
 * `(start,length,0)`. The text between markers is the word itself.
 */
export function parseYrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of raw.replace(/^\uFEFF/u, '').split(/\r\n|\n|\r/u)) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const head = /^\[(\d+),(\d+)(?:,(-?\d+))?\]/u.exec(trimmed);
    if (!head) continue;
    const lineStart = Number(head[1]) / 1000;
    const body = trimmed.slice(head[0].length);
    const words: { text: string; time: number; end?: number }[] = [];
    const marker = /\((\d+),(\d+)(?:,-?\d+)?\)/gu;
    const matches = [...body.matchAll(marker)];
    if (!matches.length) {
      const text = body.replace(/\(\d+,\d+(?:,-?\d+)?\)/gu, '').trim();
      if (text) lines.push({ text, time: round(lineStart) });
      continue;
    }
    matches.forEach((match, index) => {
      const start = match.index! + match[0].length;
      const next = matches[index + 1];
      const text = body.slice(start, next?.index ?? body.length);
      const time = Number(match[1]) / 1000;
      const length = Number(match[2]) / 1000;
      if (!text.trim()) return;
      words.push({
        text,
        time: round(time),
        ...(length > 0 ? { end: round(time + length) } : {}),
      });
    });
    if (!words.length) continue;
    const monotonic = words.every(
      (word, index) => index === 0 || word.time >= words[index - 1].time,
    );
    const text = words
      .map((word) => word.text)
      .join('')
      .trim();
    lines.push({
      text,
      time: round(Math.min(lineStart, words[0].time)),
      ...(monotonic ? { words } : {}),
    });
  }
  return lines;
}

/**
 * Base64 KRC. The payload is XORed with a fixed key after a four-byte header,
 * and this is the only way to read its word timings; the result is still just
 * text and timings, never audio.
 */
const KRC_KEY = [
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
];

export function decodeKrc(base64: string): string {
  const binary = typeof atob === 'function' ? atob(base64) : '';
  if (!binary) return '';
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index) ^ KRC_KEY[index % KRC_KEY.length];
  const text = new TextDecoder().decode(bytes.subarray(4));
  return text.replace(/^\uFEFF/u, '');
}

/** Kugou KRC text (already decoded): `[start,length]<offset,length,0>word…`. */
export function parseKrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of raw.split(/\r\n|\n|\r/u)) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const head = /^\[(\d+),(\d+)\]/u.exec(trimmed);
    if (!head) continue;
    const lineStart = Number(head[1]);
    const body = trimmed.slice(head[0].length);
    const markers = [...body.matchAll(/<(\d+),(\d+)(?:,-?\d+)?>/gu)];
    const words: { text: string; time: number; end?: number }[] = [];
    if (markers.length) {
      markers.forEach((marker, index) => {
        const start = marker.index! + marker[0].length;
        const next = markers[index + 1];
        const text = body.slice(start, next?.index ?? body.length);
        if (!text.trim()) return;
        const offset = Number(marker[1]);
        const length = Number(marker[2]);
        words.push({
          text,
          time: round((lineStart + offset) / 1000),
          ...(length > 0 ? { end: round((lineStart + offset + length) / 1000) } : {}),
        });
      });
    }
    const plain = body.replace(/<\d+,\d+(?:,-?\d+)?>/gu, '').trim();
    const text = (words.length ? words.map((word) => word.text).join('') : plain).trim();
    if (!text) continue;
    const monotonic = words.every(
      (word, index) => index === 0 || word.time >= words[index - 1].time,
    );
    lines.push({
      text,
      time: round(lineStart / 1000),
      ...(words.length && monotonic ? { words } : {}),
    });
  }
  return lines;
}

/** ISO-6709 style offset the providers embed in a header line: `[offset:123]`. */
export function headerOffsetMs(raw: string): number {
  const match = /\[offset:\s*([+-]?\d+)\s*\]/iu.exec(raw);
  const value = Number(match?.[1] ?? 0);
  return Number.isFinite(value) && Math.abs(value) <= 10_000 ? value : 0;
}

/**
 * The only word timings worth trusting are ones that follow the song. Lines are
 * checked against the file's duration and against each other; a lyric that ends
 * far past the song, or that jumps backwards, is refused.
 */
export function wordTimelinePlausible(lines: LyricLine[], duration: number): boolean {
  if (!lines.length) return false;
  let previous = -1;
  for (const line of lines) {
    if (line.time === undefined || line.time < 0) return false;
    if (line.time < previous - 0.001) return false;
    previous = line.time;
    if (line.words?.length) {
      for (let index = 1; index < line.words.length; index++)
        if (line.words[index].time < line.words[index - 1].time) return false;
      if (line.words.some((word) => word.time < 0)) return false;
    }
  }
  if (duration > 0) {
    const last = lines.at(-1)!;
    const end = last.words?.at(-1)?.end ?? last.time ?? 0;
    if ((last.time ?? 0) > duration + 8 || end > duration + 15) return false;
  }
  return true;
}

/** True when at least half of the timed lines carry word stamps. */
export function hasWordTimings(lines: LyricLine[]): boolean {
  const timed = lines.filter((line) => line.time !== undefined);
  if (!timed.length) return false;
  return timed.filter((line) => line.words?.length).length >= Math.ceil(timed.length / 2);
}

/** Readable text for a lyric body, used when the entry point needs plain lines. */
export function lyricText(lines: LyricLine[]): string {
  return lines.map((line) => line.text).join('\n');
}
