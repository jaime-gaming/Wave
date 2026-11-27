import { searchText } from './musicIdentity';
import type { Track } from './types';

export type MatchKind =
  'exact' | 'prefix' | 'word' | 'combined' | 'letters' | 'artist' | 'album' | 'other' | 'near';

const WORD = /\s+/u;

function oneEditApart(a: string, b: string) {
  if (a === b) return true;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;
  let at = 0;
  while (at < shorter.length && longer[at] === shorter[at]) at++;
  if (longer.length === shorter.length)
    return (
      longer.slice(at + 1) === shorter.slice(at + 1) ||
      (longer[at] === shorter[at + 1] &&
        longer[at + 1] === shorter[at] &&
        longer.slice(at + 2) === shorter.slice(at + 2))
    );
  return longer.slice(at + 1) === shorter.slice(at);
}

function matchDistinct(
  words: string[],
  parts: string[],
  matches: (word: string, part: string, partIndex: number) => boolean,
): boolean {
  if (!parts.length || parts.length > words.length || parts.length > 32) return false;
  const assigned = new Array<number>(words.length).fill(-1);
  const assign = (index: number, visited: boolean[]): boolean => {
    for (let i = 0; i < words.length; i++) {
      if (visited[i] || !matches(words[i], parts[index], index)) continue;
      visited[i] = true;
      if (assigned[i] < 0 || assign(assigned[i], visited)) {
        assigned[i] = index;
        return true;
      }
    }
    return false;
  };
  return parts.every((_, index) => assign(index, new Array<boolean>(words.length).fill(false)));
}

function nearWords(haystack: string, query: string) {
  const parts = query.split(WORD).filter(Boolean);
  const words = haystack.split(WORD).filter(Boolean);

  return parts.some(
    (part, typoIndex) =>
      part.length >= 6 &&
      matchDistinct(words, parts, (word, value, index) =>
        index === typoIndex
          ? word !== value && !word.startsWith(value) && oneEditApart(word, value)
          : word.startsWith(value),
      ),
  );
}

function containsWords(haystack: string, query: string) {
  return matchDistinct(
    haystack.split(WORD).filter(Boolean),
    query.split(WORD).filter(Boolean),
    (word, part) => word.includes(part),
  );
}

function startsWithWord(haystack: string, query: string) {
  if (!query) return false;
  if (haystack.startsWith(query)) return true;
  return haystack.split(WORD).some((word) => word.startsWith(query));
}

function everyWordStarts(haystack: string, query: string) {
  return matchDistinct(
    haystack.split(WORD).filter(Boolean),
    query.split(WORD).filter(Boolean),
    (word, part) => word.startsWith(part),
  );
}

export function rankMatch(track: Track, rawQuery: string): MatchKind | null {
  return normalizedMatch(track, searchText(rawQuery));
}

const index = new WeakMap<
  Track,
  { title: string; artist: string; album: string; haystack: string; filename: string }
>();
function fields(track: Track) {
  let cached = index.get(track);
  if (!cached) {
    cached = {
      title: searchText(track.title),
      artist: searchText(track.artist),
      album: searchText(track.album),
      haystack: searchText(
        `${track.title} ${track.artist} ${track.album} ${(track.genres ?? []).join(' ')} ${track.year ?? ''}`,
      ),
      filename: searchText(track.fileName),
    };
    index.set(track, cached);
  }
  return cached;
}
function normalizedMatch(track: Track, query: string): MatchKind | null {
  if (!query) return 'other';
  const { title, artist, album, haystack, filename } = fields(track);

  if (!containsWords(haystack, query) && !containsWords(filename, query))
    return nearWords(haystack, query) || nearWords(filename, query) ? 'near' : null;
  if (title === query) return 'exact';
  if (title.startsWith(query)) return 'prefix';

  if (everyWordStarts(title, query)) return 'word';
  const parts = query.split(WORD).filter(Boolean);
  if (
    parts.length > 1 &&
    containsWords(`${title} ${artist}`, query) &&
    parts.some((part) => title.includes(part)) &&
    parts.some((part) => artist.includes(part))
  )
    return 'combined';
  if (title.includes(query)) return 'letters';
  if (artist === query || startsWithWord(artist, query) || everyWordStarts(artist, query))
    return 'artist';
  if (artist.includes(query)) return 'artist';
  if (album === query || startsWithWord(album, query) || everyWordStarts(album, query))
    return 'album';
  if (album.includes(query)) return 'album';
  if (containsWords(title, query)) return 'word';
  return 'other';
}

const WEIGHT: Record<MatchKind, number> = {
  exact: 0,
  prefix: 1,
  word: 2,
  combined: 3,
  letters: 4,
  artist: 5,
  album: 6,
  other: 7,
  near: 8,
};

export function rankTracks(tracks: Track[], query: string, limit = Infinity): Track[] {
  const needle = searchText(query);
  const count =
    limit === Infinity
      ? tracks.length
      : Number.isFinite(limit)
        ? Math.max(0, Math.floor(limit))
        : 0;
  if (!needle) return limit === Infinity ? tracks : tracks.slice(0, count);
  if (!count) return [];

  const buckets: Track[][] = Array.from({ length: Object.keys(WEIGHT).length }, () => []);
  for (const track of tracks) {
    const kind = normalizedMatch(track, needle);
    if (kind && buckets[WEIGHT[kind]].length < count) buckets[WEIGHT[kind]].push(track);
  }
  return buckets.flat().slice(0, count);
}

export function rankNames<T>(
  items: T[],
  query: string,
  nameOf: (item: T) => string,
  detailOf?: (item: T) => string,
): T[] {
  const needle = searchText(query);
  if (!needle) return items;
  const scored: { item: T; weight: number; length: number; index: number }[] = [];
  for (const [index, item] of items.entries()) {
    const name = searchText(nameOf(item));
    const detail = detailOf ? searchText(detailOf(item)) : '';
    const haystack = `${name} ${detail}`;

    const direct = containsWords(haystack, needle);
    const near = !direct && nearWords(haystack, needle);
    if (!direct && !near) continue;
    const weight = near
      ? 5
      : name === needle
        ? 0
        : name.startsWith(needle)
          ? 1
          : startsWithWord(name, needle)
            ? 2
            : name.includes(needle)
              ? 3
              : 4;
    scored.push({ item, weight, length: name.length, index });
  }
  scored.sort((a, b) => a.weight - b.weight || a.length - b.length || a.index - b.index);
  return scored.map((entry) => entry.item);
}

export const RECENT_SEARCHES_KEY = 'wave-recent-searches-v1';
export const MAX_RECENT_SEARCHES = 5;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadRecentSearches(store: Storage | null = storage()): string[] {
  if (!store) return [];
  try {
    const raw = store.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === 'string' && !!value.trim())
      .map((value) => value.trim().slice(0, 80))
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function rememberSearch(query: string, store: Storage | null = storage()): string[] {
  const value = query.trim().slice(0, 80);
  if (!value) return loadRecentSearches(store);

  if (searchText(value).length < 2) return loadRecentSearches(store);
  const next = [
    value,
    ...loadRecentSearches(store).filter((item) => searchText(item) !== searchText(value)),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    store?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function clearRecentSearches(store: Storage | null = storage()): void {
  try {
    store?.removeItem(RECENT_SEARCHES_KEY);
  } catch {}
}
