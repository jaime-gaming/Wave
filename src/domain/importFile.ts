import type { ImportedEntry } from './playlistImport';
import { MAX_IMPORT_ENTRIES } from './playlistImport';
import { parseImportLink } from './linkImport';

/**
 * Reading a playlist someone exported from another app.
 *
 * Wave cannot ask Spotify or YouTube for a personal playlist without an account
 * and a server, so the honest way to bring a collection over is the file those
 * services already give you: an `.m3u` written by a desktop player, a `.csv`
 * from a data export, or simply the list copied off a screen. Everything here is
 * text in, entries out — no audio is read, written, or changed.
 */
export type ImportSource = 'm3u' | 'csv' | 'text';

export interface ParsedList {
  source: ImportSource;
  /** A name the file itself carries, when it carries one. */
  name?: string;
  entries: ImportedEntry[];
  /** Lines that looked like a playlist but yielded nothing usable. */
  skipped: number;
  /** True when the file had more entries than Wave will import in one go. */
  truncated: boolean;
}

/**
 * `#EXTINF:<seconds> [artist="…"] [album="…"],<title>` — read piece by piece
 * rather than with one expression, because an attribute may itself contain a
 * comma and the title must survive it.
 */
export function parseExtendedLine(line: string): {
  duration?: number;
  title: string;
  album?: string;
} {
  const rest = line.replace(/^#EXTINF\s*:/iu, '');
  const duration = rest.match(/^-?\d+(?:\.\d+)?/u)?.[0];
  let index = duration?.length ?? 0;
  const attributes: Record<string, string> = {};
  for (;;) {
    const attribute = rest.slice(index).match(/^\s+([a-z-]+)="([^"]*)"/iu);
    if (!attribute) break;
    attributes[attribute[1].toLowerCase()] = attribute[2];
    index += attribute[0].length;
  }
  const comma = rest.indexOf(',', index);
  const title = (comma >= 0 ? rest.slice(comma + 1) : '').trim();
  const seconds = secondsFrom(duration);
  return {
    ...(seconds ? { duration: seconds } : {}),
    title,
    ...(attributes.album ? { album: attributes.album } : {}),
  };
}

function secondsFrom(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (/^\d+(?:\.\d+)?$/u.test(text)) {
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2) return undefined;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : undefined;
}

/** "Artist - Title" as every player and every screenshot writes it. */
export function splitArtistTitle(text: string): { artist: string; title: string } {
  const cleaned = text.replace(/^\s*\d+[.)]\s*/u, '').trim();
  const dash = cleaned.split(/\s+[-–—]\s+/u);
  if (dash.length >= 2) {
    const [artist, ...rest] = dash;
    return { artist: artist.trim(), title: rest.join(' - ').trim() };
  }
  return { artist: '', title: cleaned };
}

function entry(id: string, raw: string, duration?: number): ImportedEntry {
  const { artist, title } = splitArtistTitle(raw);
  return { id, title: title || raw.trim(), artist, ...(duration ? { duration } : {}) };
}

/** A small CSV reader: quotes, doubled quotes, commas inside quotes. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

const NAME_KEYS = ['title', 'track name', 'song', 'track', 'video title', 'name', 'song title'];
const ARTIST_KEYS = [
  'artist',
  'artist name',
  'artist name(s)',
  'channel',
  'artists',
  'album artist',
];
const ALBUM_KEYS = ['album', 'album name', 'album title'];
const DURATION_KEYS = ['duration', 'duration (ms)', 'length', 'time', 'duration (s)'];

function findColumn(header: string[], keys: string[]): number {
  const normalised = header.map((cell) => cell.trim().toLowerCase());
  for (const key of keys) {
    const at = normalised.indexOf(key);
    if (at >= 0) return at;
  }
  return -1;
}

function looksLikeHeader(cells: string[]): boolean {
  const normalised = cells.map((cell) => cell.trim().toLowerCase());
  return NAME_KEYS.some((key) => normalised.includes(key));
}

function parseCsvRows(rows: string[][], limit: number): ParsedList {
  const header = rows[0] ?? [];
  const titleAt = findColumn(header, NAME_KEYS);
  const artistAt = findColumn(header, ARTIST_KEYS);
  const albumAt = findColumn(header, ALBUM_KEYS);
  const durationAt = findColumn(header, DURATION_KEYS);
  // A duration in milliseconds is a Spotify export habit; anything else is seconds.
  const milliseconds = /ms/iu.test(header[durationAt] ?? '');
  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (const cells of rows.slice(1)) {
    if (entries.length >= limit) break;
    const title = (titleAt >= 0 ? cells[titleAt] : '').trim();
    if (!title) {
      skipped++;
      continue;
    }
    const artist = (artistAt >= 0 ? cells[artistAt] : '').trim();
    const album = (albumAt >= 0 ? cells[albumAt] : '').trim();
    const rawDuration = (durationAt >= 0 ? cells[durationAt] : '').trim();
    let duration = secondsFrom(rawDuration.replace(/\s*ms$/iu, ''));
    if (duration && milliseconds) duration = Math.round(duration / 1000);
    entries.push({
      id: `csv-${entries.length}`,
      title,
      artist,
      ...(album ? { album } : {}),
      ...(duration ? { duration } : {}),
    });
  }
  return {
    source: 'csv',
    entries,
    skipped,
    truncated: rows.length - 1 > entries.length + skipped,
  };
}

function flushPending(
  pending: { duration?: number; label: string; album?: string },
  index: number,
) {
  const parsed = entry('', pending.label, pending.duration);
  return {
    ...parsed,
    id: `m3u-${index}`,
    ...(pending.album ? { album: pending.album } : {}),
  };
}

function parseM3u(text: string, limit: number): ParsedList {
  const lines = text.split(/\r?\n/u);
  const entries: ImportedEntry[] = [];
  let name: string | undefined;
  let pending: { duration?: number; label: string; album?: string } | null = null;
  let skipped = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#PLAYLIST\s*:/iu.test(trimmed)) {
      name = trimmed.replace(/^#PLAYLIST\s*:/iu, '').trim() || undefined;
      continue;
    }
    if (/^#EXTINF\s*:/iu.test(trimmed)) {
      // A list copied by hand has no file paths between the tags: the previous
      // song is complete as soon as the next one announces itself.
      if (pending && pending.label) {
        if (entries.length >= limit) break;
        entries.push(flushPending(pending, entries.length));
      }
      const extended = parseExtendedLine(trimmed);
      pending = {
        ...(extended.duration ? { duration: extended.duration } : {}),
        label: extended.title,
        ...(extended.album ? { album: extended.album } : {}),
      };
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    if (entries.length >= limit) break;
    const label =
      pending?.label || trimmed.replace(/^.*[/\\]/u, '').replace(/\.[a-z0-9]{2,4}$/iu, '');
    if (!label) {
      skipped++;
      pending = null;
      continue;
    }
    entries.push(flushPending({ ...(pending ?? { label }), label }, entries.length));
    pending = null;
  }
  if (pending && pending.label && entries.length < limit)
    entries.push(flushPending(pending, entries.length));
  return { source: 'm3u', ...(name ? { name } : {}), entries, skipped, truncated: false };
}

function parsePlainLines(text: string, limit: number): ParsedList {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (entries.length >= limit) break;
    const { title } = splitArtistTitle(line);
    if (!title) {
      skipped++;
      continue;
    }
    entries.push(entry(`text-${entries.length}`, line));
  }
  return { source: 'text', entries, skipped, truncated: lines.length > entries.length + skipped };
}

/**
 * Reads whatever was pasted: a link, an exported playlist, or a column of song
 * names. The result is always a proposal — nothing is stored by this function.
 */
export function parsePlaylistText(raw: string, limit = MAX_IMPORT_ENTRIES): ParsedList {
  const text = raw.replace(/^\uFEFF/u, '').trim();
  if (!text) return { source: 'text', entries: [], skipped: 0, truncated: false };
  if (/^#EXTM3U/iu.test(text) || /#EXTINF/iu.test(text)) return parseM3u(text, limit);
  if (/^[a-z]+:\/\//iu.test(text) || /^spotify:/iu.test(text)) {
    const link = parseImportLink(text);
    return {
      source: 'text',
      entries: [],
      skipped: link.ok ? 0 : 1,
      truncated: false,
    };
  }
  if (/[,;]/u.test(text.split(/\r?\n/u)[0] ?? '') && /\n/u.test(text)) {
    const rows = readCsv(text);
    if (rows.length && looksLikeHeader(rows[0])) return parseCsvRows(rows, limit);
  }
  return parsePlainLines(text, limit);
}

/** Whether a pasted value is a link rather than a list, for the interface copy. */
export function isLink(raw: string): boolean {
  const text = raw.trim();
  return /^[a-z]+:\/\//iu.test(text) || /^spotify:/iu.test(text);
}
