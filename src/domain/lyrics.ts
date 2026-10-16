export interface LyricLine {
  text: string;
  time?: number;
  words?: { text: string; time: number; end?: number }[];
}
export interface Lyrics {
  raw: string;
  lines: LyricLine[];
  offsetMs: number;
  source: 'local' | 'embedded' | 'lrclib';
  providerId?: number;
}
export const MAX_LYRICS_LENGTH = 100_000;
export function parseLyrics(raw: string, offsetMs = 0, source: Lyrics['source'] = 'local'): Lyrics {
  if (raw.length > MAX_LYRICS_LENGTH) throw new Error('Lyrics must be at most 100,000 characters.');
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 10_000)
    throw new Error('Timing offset must be between -10,000 and 10,000 ms.');
  const headerOffset = Number(raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/im)?.[1] ?? 0) / 1000;
  if (!Number.isFinite(headerOffset) || Math.abs(headerOffset) > 10)
    throw new Error('LRC header offset must be between -10,000 and 10,000 ms.');
  const synced: LyricLine[] = [];
  const plain: LyricLine[] = [];
  for (const row of raw.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    const stamps = [...row.matchAll(/\[(\d{1,4}):([0-5]?\d)(?:[.,:](\d{1,3}))?\]/g)];
    if (stamps.length) {
      const text = row
        .replace(/\[\d{1,4}:[0-5]?\d(?:[.,:]\d{1,3})?\]/g, '')
        .replace(/<\d{1,4}:[0-5]?\d(?:[.,:]\d{1,3})?>/g, '')
        .trim();
      const markers = [...row.matchAll(/<(\d{1,4}):([0-5]?\d)(?:[.,:](\d{1,3}))?>/g)];
      const content = row.replace(/\[\d{1,4}:[0-5]?\d(?:[.,:]\d{1,3})?\]/g, '');
      const wordMarkers = [...content.matchAll(/<(\d{1,4}):([0-5]?\d)(?:[.,:](\d{1,3}))?>/g)];
      const firstStamp =
        Number(stamps[0][1]) * 60 + Number(stamps[0][2]) + Number('0.' + (stamps[0][3] ?? '0'));
      const clock = (m: RegExpMatchArray) =>
        Number(m[1]) * 60 + Number(m[2]) + Number('0.' + (m[3] ?? '0'));
      const pieces: { text: string; time: number; end?: number }[] = [];
      if (markers.length) {
        const prefix = content.slice(0, wordMarkers[0].index).trimStart();
        if (prefix) pieces.push({ text: prefix, time: firstStamp, end: clock(wordMarkers[0]) });
        wordMarkers.forEach((m, i) => {
          const next = wordMarkers[i + 1];
          const part = content.slice(m.index! + m[0].length, next?.index ?? content.length);
          if (part)
            pieces.push({ text: part, time: clock(m), ...(next ? { end: clock(next) } : {}) });
        });
        if (pieces.length) pieces[pieces.length - 1].text = pieces.at(-1)!.text.trimEnd();
      }
      const valid =
        pieces.length > 0 &&
        pieces.every(
          (piece, i) =>
            piece.time >= firstStamp &&
            (!i || piece.time >= pieces[i - 1].time) &&
            (piece.end === undefined || piece.end >= piece.time),
        );
      for (const match of stamps)
        synced.push({
          text,
          ...(valid
            ? {
                words: pieces.map((piece) => ({
                  ...piece,
                  time: Math.max(0, piece.time + clock(match) - firstStamp - headerOffset),
                  ...(piece.end !== undefined
                    ? { end: Math.max(0, piece.end + clock(match) - firstStamp - headerOffset) }
                    : {}),
                })),
              }
            : {}),
          time: Math.max(
            0,
            Number(match[1]) * 60 +
              Number(match[2]) +
              Number('0.' + (match[3] ?? '0')) -
              headerOffset,
          ),
        });
    } else if (row.trim() && !/^\[(ar|ti|al|by|offset|length|re|ve):/i.test(row))
      plain.push({ text: row.trim() });
  }
  const lines = synced.length ? synced.sort((a, b) => a.time! - b.time!) : plain;
  if (lines.length > 2000) throw new Error('Use at most 2,000 lyric lines.');
  return { raw, lines, offsetMs, source };
}
export function activeLyricIndex(lyrics: Lyrics, seconds: number): number {
  if (!Number.isFinite(seconds) || lyrics.lines[0]?.time === undefined) return -1;
  const clock = seconds - lyrics.offsetMs / 1000;
  let low = 0,
    high = lyrics.lines.length - 1,
    result = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lyrics.lines[mid].time! <= clock) {
      result = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return result;
}
/** Visual interpolation of line timing, not fabricated word timestamps. */
export function lyricFillProgress(lyrics: Lyrics, seconds: number, duration?: number): number {
  const index = activeLyricIndex(lyrics, seconds);
  if (index < 0) return 0;
  const start = lyrics.lines[index].time!;
  const next = lyrics.lines.slice(index + 1).find((line) => line.time! > start)?.time;
  const end =
    next ?? (duration && Number.isFinite(duration) ? duration - lyrics.offsetMs / 1000 : undefined);
  if (end === undefined || end <= start) return 1;
  return Math.max(0, Math.min(1, (seconds - lyrics.offsetMs / 1000 - start) / (end - start)));
}
export function lyricFillTokens(text: string) {
  const total = Array.from(text).length || 1;
  let offset = 0;
  return text
    .split(/(\s+)/u)
    .filter(Boolean)
    .map((text) => {
      const length = Array.from(text).length;
      const token = { text, start: offset / total, end: (offset + length) / total };
      offset += length;
      return token;
    });
}
export function embeddedLyrics(
  tags?: {
    text?: string;
    timeStampFormat?: number;
    syncText?: { text: string; timestamp?: number }[];
  }[],
): Lyrics | undefined {
  for (const tag of tags ?? []) {
    if (
      tag.timeStampFormat === 2 &&
      tag.syncText?.some((line) => Number.isFinite(line.timestamp))
    ) {
      const raw = tag.syncText
        .filter(
          (line) =>
            line.timestamp !== undefined && Number.isFinite(line.timestamp) && line.timestamp >= 0,
        )
        .map((line) => {
          const milliseconds = Math.round(line.timestamp!);
          const seconds = milliseconds / 1000;
          return `[${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}]${line.text}`;
        })
        .join('\n');
      const parsed = parseLyrics(raw, 0, 'embedded');
      if (parsed.lines.some((line) => line.text)) return parsed;
    }
    const raw = tag.text ?? tag.syncText?.map((line) => line.text).join('\n');
    if (raw) {
      const parsed = parseLyrics(raw, 0, 'embedded');
      if (parsed.lines.length) return parsed;
    }
  }
}

/** Only provider-supplied timestamp segments receive word timing; plain LRC stays interpolated. */
export function timedWordProgress(
  word: { time: number; end?: number },
  seconds: number,
  offsetMs: number,
  nextLine?: number,
  duration?: number,
) {
  const clock = seconds - offsetMs / 1000;
  const end =
    word.end ??
    nextLine ??
    (duration && duration - offsetMs / 1000 > word.time ? duration - offsetMs / 1000 : undefined);
  if (clock < word.time) return 0;
  if (end === undefined || end <= word.time) return 1;
  return Math.max(0, Math.min(1, (clock - word.time) / (end - word.time)));
}
export function validLyricTimeline(lyrics: Lyrics, duration: number) {
  if (duration <= 0 || !Number.isFinite(duration)) return true;
  return lyrics.lines.every(
    (line) =>
      line.time === undefined ||
      (line.time <= duration + 0.5 &&
        (line.words ?? []).every(
          (word) =>
            word.time <= duration + 0.5 && (word.end === undefined || word.end <= duration + 0.5),
        )),
  );
}
