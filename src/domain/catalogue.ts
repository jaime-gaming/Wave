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
  /** Where the provider places the song on its album, so an album can be ordered. */
  trackNumber?: number;
  discNumber?: number;
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
  // Underscores joined as words, or a bare track position: the two shapes a
  // filename has and a title almost never does. The old rule also caught any
  // title containing "final", "mix", "copy" or "take", which called perfectly
  // good songs by their file name — "Take Five" among them.
  if (/\p{L}[_]+\p{L}/u.test(title)) return true;
  if (/^\d{1,3}\s*[-._]\s*\p{L}/u.test(title)) return true;
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
  // Only the things a listener actually notices are missing: who it is, what it
  // is called, which album it belongs to and which cover it wears. A year or a
  // genre missing is normal in a private library and never worth a request.
  return (
    !track.artwork ||
    isPlaceholderArtist(track.artist) ||
    isPlaceholderAlbum(track.album) ||
    looksLikeFileName(track) ||
    // A song on a real album with no position has no place in it. Asking costs
    // one request and gives the album its running order.
    (!track.trackNumber && !isPlaceholderAlbum(track.album))
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

/**
 * A title without the parts a provider adds and a file rarely has.
 *
 * "Song (feat. Somebody) - 2011 Remaster" and "Song" are the same recording, and
 * a match that fails because of the bracket is a gap left open for no reason.
 */
export function bareTitle(value: string): string {
  return letters(
    value
      .replace(/[([{][^)\]}]*[)\]}]/gu, ' ')
      .replace(/\s+[-–—]\s+.*$/u, ' ')
      .replace(/\b(?:feat|ft|featuring|prod|remaster(?:ed)?|deluxe|edition)\b.*$/iu, ' '),
  );
}

function shared(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let count = 0;
  for (const token of left) if (right.has(token)) count++;
  return count / Math.min(left.size, right.size);
}

/**
 * Whether one title contains the other once its decorations are gone.
 *
 * "Song" against "Song (feat. Somebody)" is a full match, not a half one: the
 * shorter title is entirely present in the longer. Two titles that merely share
 * a word are not, which is why this is containment and not overlap.
 */
function titleOverlap(track: string, release: string): number {
  const left = bareTitle(track);
  const right = bareTitle(release);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  if (shorter.length < 4) return 0;
  return longer.includes(shorter) ? 1 : 0;
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
  const titleScore = Math.max(
    shared(wantedTitle, foundTitle),
    titleOverlap(track.title, release.title),
  );
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
  // Two editions of the same album share a title and a release year closely, so
  // the album the song already names is what separates them. It adds nothing when
  // the song does not know its album, and it never overrides a wrong artist.
  if (!isPlaceholderAlbum(track.album) && release.album) {
    const albumScore = shared(tokens(track.album), tokens(release.album));
    if (albumScore >= 0.5) score += 0.06 * albumScore;
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
  patch: Partial<
    Pick<
      Track,
      'title' | 'artist' | 'album' | 'year' | 'genres' | 'artwork' | 'trackNumber' | 'discNumber'
    >
  >;
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

  // A title that is really a filename is the one thing worth replacing, and it
  // does not depend on the album being known: a nameless album used to block the
  // fix, which left the file's name sitting in the library forever.
  const releaseTitle = release.title.trim();
  if (
    looksLikeFileName(track) &&
    releaseTitle &&
    !looksLikeFileName({ ...track, title: releaseTitle })
  ) {
    patch.title = releaseTitle;
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
  // The album's running order, but only from a release that is this song's album:
  // the position of a track on someone else's compilation is not an answer.
  const sameAlbum =
    !isPlaceholderAlbum(track.album) &&
    !!release.album &&
    bareTitle(track.album) !== '' &&
    (bareTitle(track.album) === bareTitle(release.album) ||
      bareTitle(release.album).includes(bareTitle(track.album)) ||
      bareTitle(track.album).includes(bareTitle(release.album)));
  if (sameAlbum && !track.trackNumber && release.trackNumber && release.trackNumber > 0) {
    patch.trackNumber = Math.round(release.trackNumber);
    if (release.discNumber && release.discNumber > 1)
      patch.discNumber = Math.round(release.discNumber);
    filled.push('order');
  }
  if (!track.genres?.length && release.genre?.trim()) {
    // Providers list several styles in one string; splitting them keeps the
    // library's own genre filter useful instead of holding "Pop / Soul".
    const genres = release.genre
      .split(/\s*[/;|,]\s*|\s+(?:and|&)\s+/iu)
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 1)
      .slice(0, 3);
    if (genres.length) {
      patch.genres = genres;
      filled.push(genres.length === 1 ? 'genre' : 'genres');
    }
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
    !looksLikeFileName(track) &&
    (isPlaceholderAlbum(track.album) || !!track.trackNumber)
  );
}
