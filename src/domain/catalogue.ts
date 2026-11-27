import { metadataIssues, rolesReviewKey } from './metadata';
import type { Track } from './types';

export interface CatalogueRelease {
  title: string;
  artist: string;
  album: string;

  provider?: 'Apple Music' | 'MusicBrainz' | 'Deezer';

  year?: number;
  genre?: string;

  duration?: number;

  artworkUrl?: string;

  artistArtworkUrl?: string;

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

export function looksLikeFileName(track: Pick<Track, 'title' | 'fileName'>): boolean {
  const title = track.title.trim();
  if (!title) return true;

  if (/\p{L}[_]+\p{L}/u.test(title)) return true;
  if (/^\d{1,3}\s*[-._]\s*\p{L}/u.test(title)) return true;
  const stem = track.fileName
    .replace(/\.[a-z0-9]{2,5}$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .trim();
  return stem.toLowerCase() === title.toLowerCase() && /[_-]/u.test(track.fileName);
}

export function needsDetails(track: Track): boolean {
  if (track.editedAt) return false;
  if (track.source === 'youtube') return false;

  return (
    metadataIssues(track).includes('roles') ||
    !track.artwork ||
    !track.year ||
    !track.genres?.length ||
    isPlaceholderArtist(track.artist) ||
    isPlaceholderAlbum(track.album) ||
    looksLikeFileName(track) ||
    (!track.trackNumber && !isPlaceholderAlbum(track.album))
  );
}

const FILE_NOISE =
  /\((?:official|lyrics?|audio|video|hd|hq|4k|320\s*kbps|flac|wav|mp3|explicit|clean)[^)]*\)|\[[^\]]*(?:kbps|flac|wav|mp3|official|rip|web|cd|vinyl|audio|video)[^\]]*\]/giu;

function cleanQueryPiece(value: string): string {
  return value
    .replace(FILE_NOISE, ' ')
    .replace(/^\s*\d{1,3}\s*[-._)]\s+(?=\p{L})/u, '')
    .replace(/[_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function catalogueQuery(track: Track): string {
  const title = cleanQueryPiece(track.title);
  const artist = isPlaceholderArtist(track.artist) ? '' : cleanQueryPiece(track.artist);
  if (!title) return '';
  return artist ? `${artist} ${title}` : title;
}

export function catalogueFallbackQueries(track: Track): string[] {
  const primary = catalogueQuery(track);
  const queries: string[] = [];
  const add = (q: string) => {
    const trimmed = q.trim();
    if (trimmed && trimmed.toLowerCase() !== primary.toLowerCase() && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  };
  const bare = bareTitle(track.title);
  const artist = isPlaceholderArtist(track.artist) ? '' : cleanQueryPiece(track.artist);
  const album = isPlaceholderAlbum(track.album) ? '' : cleanQueryPiece(track.album);
  if (bare && artist) add(`${artist} ${bare}`);
  if (bare && album) add(`${bare} ${album}`);
  if (artist && bare) add(`${bare} ${artist}`);
  if (bare && !artist) add(bare);
  return queries.slice(0, 2);
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

const COVER_NOISE =
  /\b(?:karaoke|tribute|ringtone|8-?bit|lullaby|made famous by|in the style of)\b/iu;
const EDITION_MARKER = /\b(?:live|acoustic|remix|sped up|slowed|nightcore|instrumental)\b/iu;

export function scoreRelease(track: Track, release: CatalogueRelease): number {
  const wantedTitle = tokens(cleanQueryPiece(track.title));
  const foundTitle = tokens(release.title);
  const titleScore = Math.max(
    shared(wantedTitle, foundTitle),
    titleOverlap(track.title, release.title),
  );
  if (titleScore < 0.5) return 0;
  let score = titleScore * 0.58;
  const artist = isPlaceholderArtist(track.artist) ? '' : track.artist;
  if (artist) {
    const artistScore = shared(tokens(artist), tokens(release.artist));
    if (artistScore < 0.34) return 0;
    score += artistScore * 0.3;
  } else {
    score += 0.18;
  }

  if (!isPlaceholderAlbum(track.album) && release.album) {
    const albumScore = shared(tokens(track.album), tokens(release.album));
    if (albumScore >= 0.5) score += 0.06 * albumScore;
  }
  if (track.duration > 30 && release.duration && release.duration > 0) {
    const difference = Math.abs(release.duration - track.duration);

    if (difference > 40) return 0;

    const durationScore =
      difference <= 3 ? 0.12 : difference <= 10 ? 0.09 : 0.08 * (1 - difference / 40);
    score += durationScore;
  } else {
    score += 0.05;
  }

  const trackText = `${track.title} ${track.artist} ${track.album}`;
  const releaseText = `${release.title} ${release.artist} ${release.album}`;
  if (COVER_NOISE.test(releaseText) && !COVER_NOISE.test(trackText)) score -= 0.38;
  if (EDITION_MARKER.test(release.title) && !EDITION_MARKER.test(track.title)) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

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

export function confirmedRoleRelease(
  track: Track,
  releases: CatalogueRelease[],
): CatalogueRelease | undefined {
  if (track.editedAt || track.rolesReviewed === rolesReviewKey(track) || track.duration <= 0)
    return undefined;
  // Do not guess when the catalogue contains an equally plausible recording in the original orientation.
  if (
    releases.some(
      (release) =>
        letters(release.title) === letters(track.title) &&
        letters(release.artist) === letters(track.artist) &&
        !!release.duration &&
        Math.abs(release.duration - track.duration) <= 3,
    )
  )
    return undefined;
  return releases.find(
    (release) =>
      letters(release.title) === letters(track.artist) &&
      letters(release.artist) === letters(track.title) &&
      !!release.duration &&
      Math.abs(release.duration - track.duration) <= 3,
  );
}

export interface DetailsPatch {
  patch: Partial<
    Pick<
      Track,
      'title' | 'artist' | 'album' | 'year' | 'genres' | 'artwork' | 'trackNumber' | 'discNumber'
    >
  >;

  filled: string[];
}

export function detailsPatch(track: Track, release: CatalogueRelease): DetailsPatch {
  if (track.editedAt) return { patch: {}, filled: [] };
  const patch: DetailsPatch['patch'] = {};
  const filled: string[] = [];
  if (confirmedRoleRelease(track, [release])) {
    patch.title = release.title.trim();
    patch.artist = release.artist.trim();
    filled.push('title', 'artist');
  }

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
