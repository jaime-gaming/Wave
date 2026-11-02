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
export type MatchKind =
  'exact' | 'prefix' | 'word' | 'letters' | 'artist' | 'album' | 'other' | 'near';

const WORD = /\s+/u;

/**
 * One typo is still the song you meant.
 *
 * A search that returns nothing because a letter landed in the wrong place is
 * read as the library not having the song, which is the worst thing a search can
 * say. Every word of the query is allowed to be one letter away from a word of
 * the text — typed too quickly, spelled the way it sounds, or with two letters
 * the wrong way round. This sits at the bottom of the ladder: a near hit never
 * outranks something that actually contains what was typed.
 */
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

/**
 * Every word of the query accounted for: either the text already has it, or it is
 * a word of at least six letters one letter away. The floor is what keeps the
 * tolerance from swallowing the library — *light* and *night* are one letter
 * apart and have nothing to do with each other.
 */
function nearWords(haystack: string, query: string) {
  const parts = query.split(WORD).filter(Boolean);
  if (!parts.length) return false;
  const words = haystack.split(WORD).filter(Boolean);
  let forgiven = 0;
  for (const part of parts) {
    if (words.some((word) => word === part || word.startsWith(part))) continue;
    if (part.length < 6 || !words.some((word) => oneEditApart(word, part))) return false;
    forgiven++;
  }
  return forgiven > 0;
}

function containsWords(haystack: string, query: string) {
  const parts = query.split(WORD).filter(Boolean);
  return parts.length > 0 && parts.every((part) => haystack.includes(part));
}

function startsWithWord(haystack: string, query: string) {
  if (!query) return false;
  if (haystack.startsWith(query)) return true;
  return haystack.split(WORD).some((word) => word.startsWith(query));
}

/** Every word of the query beginning a word of the text: "city mid" finds *Midnight City*. */
function everyWordStarts(haystack: string, query: string) {
  const parts = query.split(WORD).filter(Boolean);
  if (parts.length === 0) return false;
  const words = haystack.split(WORD);
  return parts.every((part) => words.some((word) => word.startsWith(part)));
}

/** How well one song answers one query, and whether it answers at all. */
export function rankMatch(track: Track, rawQuery: string): MatchKind | null {
  const query = searchText(rawQuery);
  if (!query) return 'other';
  const title = searchText(track.title);
  const artist = searchText(track.artist);
  const album = searchText(track.album);
  const haystack = searchText(`${track.title} ${track.artist} ${track.album} ${track.fileName}`);
  if (!matchesSearch(`${track.title} ${track.artist} ${track.album} ${track.fileName}`, rawQuery))
    return nearWords(haystack, query) ? 'near' : null;
  if (title === query) return 'exact';
  if (title.startsWith(query)) return 'prefix';
  // Every word of the query beginning a word of the title is a real answer —
  // "city mid" for *Midnight City*, "night" for *Nightcall* — while the same
  // letters buried inside a word are not, and rank below who made the song.
  if (everyWordStarts(title, query)) return 'word';
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
  letters: 3,
  artist: 4,
  album: 5,
  other: 6,
  near: 7,
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
 * The same ladder for the things that are only a name: artists, albums and
 * playlists.
 *
 * They used to be filtered and left in whatever order the library happened to
 * hold, so typing an artist's name surfaced three of their albums before the
 * artist themselves. Now the name you typed comes first, a name that starts with
 * it next, then a name with that word in it, then anything that merely contains
 * the letters — and a shorter name wins a tie, because *Night* is a closer answer
 * to "night" than *Nightcall (Deluxe)*.
 */
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
    // A name one letter away from what was typed is still that name; it sorts
    // under everything that was actually spelled that way.
    const near = !needle.split(WORD).every((part) => haystack.includes(part))
      ? nearWords(haystack, needle)
      : false;
    if (!needle.split(WORD).every((part) => haystack.includes(part)) && !near) continue;
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
