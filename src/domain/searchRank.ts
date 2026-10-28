import { matchesSearch, searchText } from './musicIdentity';
import type { Track } from './types';

/**
 * Search, ordered by how well it matched.
 *
 * Filtering already worked; the list it produced did not. `filterTracks` keeps
 * library order, so typing "nig" put *Tonight* above *Nightcall* because that
 * song happened to be imported first. Ranking fixes the only thing a search has
 * to get right: the thing you meant is at the top.
 *
 * The ladder is deliberately plain and explainable — exact title, then a title
 * that starts with what you typed, then a word in the title, then the artist,
 * then the album, then anything else that contains every word. Ties keep
 * library order, so the list does not shuffle between keystrokes.
 */
export type MatchKind = 'exact' | 'prefix' | 'word' | 'artist' | 'album' | 'other';

const WORD = /\s+/u;

function containsWords(haystack: string, query: string) {
  const parts = query.split(WORD).filter(Boolean);
  return parts.length > 0 && parts.every((part) => haystack.includes(part));
}

function startsWithWord(haystack: string, query: string) {
  if (!query) return false;
  if (haystack.startsWith(query)) return true;
  return haystack.split(WORD).some((word) => word.startsWith(query));
}

/** How well one song answers one query, and whether it answers at all. */
export function rankMatch(track: Track, rawQuery: string): MatchKind | null {
  const query = searchText(rawQuery);
  if (!query) return 'other';
  const title = searchText(track.title);
  const artist = searchText(track.artist);
  const album = searchText(track.album);
  if (!matchesSearch(`${track.title} ${track.artist} ${track.album} ${track.fileName}`, rawQuery))
    return null;
  if (title === query) return 'exact';
  if (title.startsWith(query)) return 'prefix';
  if (startsWithWord(title, query)) return 'word';
  if (startsWithWord(artist, query) || artist === query) return 'artist';
  if (startsWithWord(album, query) || album === query) return 'album';
  if (containsWords(title, query)) return 'word';
  return 'other';
}

const WEIGHT: Record<MatchKind, number> = {
  exact: 0,
  prefix: 1,
  word: 2,
  artist: 3,
  album: 4,
  other: 5,
};

/**
 * Matching songs, best first. `limit` keeps a live search from sorting a
 * ten-thousand-song library on every keystroke.
 */
export function rankTracks(tracks: Track[], query: string, limit = Infinity): Track[] {
  if (!query.trim()) return tracks;
  const scored: { track: Track; weight: number; index: number }[] = [];
  for (const [index, track] of tracks.entries()) {
    const kind = rankMatch(track, query);
    if (!kind) continue;
    scored.push({ track, weight: WEIGHT[kind], index });
  }
  scored.sort((a, b) => a.weight - b.weight || a.index - b.index);
  return scored.slice(0, limit === Infinity ? scored.length : limit).map((entry) => entry.track);
}

/**
 * Recent searches, kept locally.
 *
 * A search is a small piece of intent, and retyping it is the most annoying
 * part of a library app. Five entries, no timestamps beyond order, and a plain
 * way to forget them.
 */
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
  // Ignore a one-letter search: it says nothing about what you were looking for.
  if (searchText(value).length < 2) return loadRecentSearches(store);
  const next = [
    value,
    ...loadRecentSearches(store).filter((item) => searchText(item) !== searchText(value)),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    store?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Storage is full or unavailable; the session still searches.
  }
  return next;
}

export function clearRecentSearches(store: Storage | null = storage()): void {
  try {
    store?.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Nothing to clear.
  }
}
