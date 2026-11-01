import type { Track } from './types';

/**
 * Completing what a file already says about itself.
 *
 * An analysed file is only as good as its tags. Ripped collections often carry
 * nothing but a filename, and a great many files carry no sleeve at all, so the
 * library looks unfinished even when the music is perfectly good. This module
 * decides two things and nothing else: whether a song has holes worth asking
 * about, and — when an answer comes back — precisely which holes it may fill.
 *
 * Two rules hold everywhere here.
 *
 * 1. It only ever *fills*, never replaces. A real artist name is not improved by
 *    whichever release the catalogue happened to rank first, and a listener who
 *    corrected a title by hand outranks any release.
 * 2. `duration` is never touched. The decoder knows how long the actual file is;
 *    a catalogue knows how long its own edition is.
 */

export interface CatalogueRelease {
  title: string;
  artist: string;
  album: string;
  /** Release year reported by the provider, when it reports one. */
  year?: number;
  genre?: string;
  /** Seconds, as the provider lists the recording. */
  duration?: number;
  /** A remote cover URL; fetched and stored as a local image before use. */
  artworkUrl?: string;
}

export const UNKNOWN = { artist: 'unknown artist', album: 'unknown album' } as const;

export function isPlaceholderArtist(artist: string | undefined): boolean {
  const value = (artist ?? '').trim().toLowerCase();
  return !value || value === UNKNOWN.artist || value === 'unknown' || value === 'various artists';
}

export function isPlaceholderAlbum(album: string | undefined): boolean {
  const value = (album ?? '').trim().toLowerCase();
  return !value || value === UNKNOWN.album || value === UNKNOWN.album.replace('unknown ', '');
}

/** A title that is really a filename: `01_-_track`, `song_2`, `final_mix_3`. */
export function looksLikeFileName(track: Pick<Track, 'title' | 'fileName'>): boolean {
  const title = track.title.trim();
  if (!title) return true;
  if (/[_]{1,}|\b(?:final|mix|copy|take)\s*\d*\b/iu.test(title)) return true;
  const stem = track.fileName
    .replace(/\.[a-z0-9]{2,5}$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .trim();
  return stem.toLowerCase() === title.toLowerCase() && /[_-]/u.test(track.fileName);
}

/**
 * Is this song worth one question?
 *
 * Cheap to answer and deliberately blunt: a missing sleeve, an unknown artist or
 * album, no year, no genre, or a title that is plainly a filename. Everything
 * else is a song that already knows what it is.
 */
export function needsDetails(track: Track): boolean {
  if (track.editedAt) return false;
  if (track.source === 'youtube') return false;
  return (
    !track.artwork ||
    isPlaceholderArtist(track.artist) ||
    isPlaceholderAlbum(track.album) ||
    !track.year ||
    !track.genres?.length ||
    looksLikeFileName(track)
  );
}

/** The words to send: real values only, never the word "unknown". */
export function catalogueQuery(track: Track): string {
  const title = track.title.replace(/[_]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  const artist = isPlaceholderArtist(track.artist) ? '' : track.artist.trim();
  if (!title) return '';
  return artist ? `${artist} ${title}` : title;
}

const letters = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const tokens = (value: string) => new Set(letters(value).split(' ').filter(Boolean));

function shared(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let count = 0;
  for (const token of left) if (right.has(token)) count++;
  return count / Math.min(left.size, right.size);
}

/**
 * How much a release answers this track, 0–1.
 *
 * Title and artist carry the weight; the running time breaks ties between two
 * editions, and a different artist is disqualifying rather than merely costly —
 * a cover band's album is not this song's album.
 */
export function scoreRelease(track: Track, release: CatalogueRelease): number {
  const wantedTitle = tokens(track.title.replace(/[_]+/gu, ' '));
  const foundTitle = tokens(release.title);
  const titleScore = shared(wantedTitle, foundTitle);
  if (titleScore < 0.5) return 0;
  let score = titleScore * 0.6;
  const artist = isPlaceholderArtist(track.artist) ? '' : track.artist;
  if (artist) {
    const artistScore = shared(tokens(artist), tokens(release.artist));
    if (artistScore < 0.34) return 0;
    score += artistScore * 0.3;
  } else {
    score += 0.2;
  }
  if (track.duration > 30 && release.duration && release.duration > 0) {
    const difference = Math.abs(release.duration - track.duration);
    // Recordings of the same song differ by seconds, not by minutes.
    if (difference > 40) return 0;
    score += 0.1 * (1 - difference / 40);
  } else {
    score += 0.05;
  }
  return Math.min(1, score);
}

/** The best release for this track, or nothing when none is convincing enough. */
export function bestRelease(
  track: Track,
  releases: CatalogueRelease[],
  accept = 0.62,
): CatalogueRelease | undefined {
  let best: CatalogueRelease | undefined;
  let bestScore = 0;
  for (const release of releases) {
    const score = scoreRelease(track, release);
    if (score > bestScore) {
      best = release;
      bestScore = score;
    }
  }
  return bestScore >= accept ? best : undefined;
}

export interface DetailsPatch {
  patch: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'year' | 'genres' | 'artwork'>>;
  /** What changed, in the interface's own words. */
  filled: string[];
}

/**
 * What may be written from a release. Empty when the listener edited this song.
 *
 * Artwork is decided by the caller, which is the only party that can fetch and
 * store an image; everything textual is decided here.
 */
export function detailsPatch(track: Track, release: CatalogueRelease): DetailsPatch {
  if (track.editedAt) return { patch: {}, filled: [] };
  const patch: DetailsPatch['patch'] = {};
  const filled: string[] = [];

  if (looksLikeFileName(track) && !isPlaceholderAlbum(release.album) && release.title.trim()) {
    patch.title = release.title.trim();
    filled.push('title');
  }
  if (isPlaceholderArtist(track.artist) && !isPlaceholderArtist(release.artist)) {
    patch.artist = release.artist.trim();
    filled.push('artist');
  }
  if (isPlaceholderAlbum(track.album) && !isPlaceholderAlbum(release.album)) {
    patch.album = release.album.trim();
    filled.push('album');
  }
  if (
    !track.year &&
    release.year &&
    release.year > 1000 &&
    release.year <= new Date().getFullYear() + 1
  ) {
    patch.year = release.year;
    filled.push('year');
  }
  if (!track.genres?.length && release.genre?.trim()) {
    patch.genres = [release.genre.trim()];
    filled.push('genre');
  }
  return { patch, filled };
}

/** True when nothing worth asking about is left, so the song is not asked again. */
export function detailsComplete(track: Track): boolean {
  return (
    !!track.artwork &&
    !isPlaceholderArtist(track.artist) &&
    !isPlaceholderAlbum(track.album) &&
    !!track.year &&
    !looksLikeFileName(track)
  );
}
