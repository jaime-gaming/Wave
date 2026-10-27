/**
 * Choosing a lyric candidate from the extra providers.
 *
 * Same rule as the rest of Wave: never accept a recording that does not match.
 * Both providers return many rows for one query, and the wrong one is worse than
 * nothing, because it looks right until the words drift.
 */
export interface ProviderSong {
  id: string;
  title: string;
  artist: string;
  /** Seconds; 0 when unknown. */
  duration: number;
  /** Extra key some providers need to fetch the lyric (Kugou access key). */
  accessKey?: string;
}

const strip = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const tokens = (value: string) => new Set(strip(value).split(' ').filter(Boolean));

function similarity(a: string, b: string): number {
  const left = tokens(a),
    right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

/** Rejects "live at…", "remix" and other versions when the file is the studio cut. */
const VERSION_WORDS = ['live', 'remix', 'acoustic', 'instrumental', 'karaoke', 'demo'];

export function scoreProviderSong(
  song: ProviderSong,
  wanted: { title: string; artist: string; duration: number },
): number {
  const titleScore = similarity(song.title, wanted.title);
  if (titleScore < 0.4) return 0;
  const artistScore = similarity(song.artist, wanted.artist);
  const title = strip(song.title);
  if (VERSION_WORDS.some((word) => title.includes(word) && !strip(wanted.title).includes(word)))
    return 0;
  let score = titleScore * 0.55 + artistScore * 0.25;
  if (wanted.duration > 30 && song.duration > 0) {
    const difference = Math.abs(song.duration - wanted.duration);
    if (difference > 12) return 0;
    score += 0.2 * (1 - difference / 12);
  } else score += 0.05;
  return Math.min(1, score);
}

/** Best candidate above the floor, or null. Higher score wins, then closer length. */
export function pickProviderSong(
  songs: ProviderSong[],
  wanted: { title: string; artist: string; duration: number },
  floor = 0.6,
): ProviderSong | null {
  let best: ProviderSong | null = null;
  let bestScore = 0;
  for (const song of songs) {
    const score = scoreProviderSong(song, wanted);
    if (score > bestScore) {
      bestScore = score;
      best = song;
    }
  }
  return bestScore >= floor ? best : null;
}

/** Duration is often "04:12"; anything else returns 0 instead of a guess. */
export function parseClock(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value !== 'string') return 0;
  const match = /^(\d{1,3}):([0-5]\d)$/u.exec(value.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

interface NetEaseRow {
  id?: unknown;
  name?: unknown;
  dt?: unknown;
  duration?: unknown;
  artists?: unknown;
  ar?: unknown;
}

const names = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : ''))
    .filter((name): name is string => typeof name === 'string' && !!name)
    .join(' ');
};

/** NetEase search payload (`/api/search/get/web` and the newer `cloudsearch`). */
export function parseNetEaseSongs(payload: unknown): ProviderSong[] {
  const result = (payload as { result?: { songs?: unknown; songCount?: unknown } })?.result;
  const rows = result?.songs;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): ProviderSong[] => {
    const entry = row as NetEaseRow;
    const id = typeof entry.id === 'number' || typeof entry.id === 'string' ? String(entry.id) : '';
    if (!id || typeof entry.name !== 'string') return [];
    return [
      {
        id,
        title: entry.name,
        artist: names(entry.ar) || names(entry.artists),
        duration: Number(entry.dt ?? entry.duration ?? 0) / 1000,
      },
    ];
  });
}

/** NetEase lyric payload: `yrc.lyric` carries word stamps, `lrc.lyric` does not. */
export function parseNetEaseLyric(payload: unknown): { yrc?: string; lrc?: string } {
  const body = payload as { yrc?: { lyric?: unknown }; lrc?: { lyric?: unknown } };
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
  return { yrc: text(body?.yrc?.lyric), lrc: text(body?.lrc?.lyric) };
}

/** Kugou lyric search payload: candidates need `id` + `accesskey`. */
export function parseKugouCandidates(payload: unknown): ProviderSong[] {
  const candidates = (payload as { candidates?: unknown })?.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((row): ProviderSong[] => {
    if (!row || typeof row !== 'object') return [];
    const entry = row as Record<string, unknown>;
    const id = typeof entry.id === 'number' || typeof entry.id === 'string' ? String(entry.id) : '';
    const accessKey = typeof entry.accesskey === 'string' ? entry.accesskey : '';
    const title = typeof entry.song === 'string' ? entry.song : '';
    if (!id || !accessKey || !title) return [];
    return [
      {
        id,
        title,
        artist: typeof entry.singer === 'string' ? entry.singer : '',
        duration: parseClock(entry.duration),
        accessKey,
      },
    ];
  });
}

/** Kugou download payload: base64 KRC (or plain LRC) plus its charset. */
export function parseKugouLyric(payload: unknown): { krc?: string; lrc?: string } {
  const body = payload as { content?: unknown; fmt?: unknown };
  const content = typeof body?.content === 'string' ? body.content : '';
  if (!content) return {};
  return String(body?.fmt ?? '').toLowerCase() === 'krc' ? { krc: content } : { lrc: content };
}
