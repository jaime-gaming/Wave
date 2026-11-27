import type { LyricLine } from './lyrics';

const round = (value: number) => Math.round(value * 1000) / 1000;

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

const KRC_KEY = [
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
];

export async function decodeKrc(base64: string): Promise<string> {
  if (!base64 || base64.length > 2 * 1024 * 1024) return '';
  try {
    const binary = atob(base64);

    if (!binary.startsWith('krc1')) {
      const text = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
      return /^\s*\[(?:\d+,\d+|offset:)/u.test(text) ? text : '';
    }
    if (typeof DecompressionStream === 'undefined') return '';

    const payload = new Uint8Array(binary.length - 4);
    for (let index = 0; index < payload.length; index++)
      payload[index] = binary.charCodeAt(index + 4) ^ KRC_KEY[index % KRC_KEY.length];
    const reader = new Response(payload)
      .body!.pipeThrough(new DecompressionStream('deflate'))
      .getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return '';
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(output).replace(/^\uFEFF/u, '');
  } catch {
    return '';
  }
}

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

export function headerOffsetMs(raw: string): number {
  const match = /\[offset:\s*([+-]?\d+)\s*\]/iu.exec(raw);
  const value = Number(match?.[1] ?? 0);
  return Number.isFinite(value) && Math.abs(value) <= 10_000 ? value : 0;
}

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

export function hasWordTimings(lines: LyricLine[]): boolean {
  const timed = lines.filter((line) => line.time !== undefined);
  if (!timed.length) return false;
  return timed.filter((line) => line.words?.length).length >= Math.ceil(timed.length / 2);
}

export function lyricText(lines: LyricLine[]): string {
  return lines.map((line) => line.text).join('\n');
}
