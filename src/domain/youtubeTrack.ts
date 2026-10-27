/**
 * Songs that live on YouTube.
 *
 * Wave 1.1 lets a library hold two kinds of song: files on this device, and
 * YouTube videos the user chose to add. A YouTube song is a *reference*: the
 * video stays on YouTube, plays through the official embedded player, and is
 * never downloaded, proxied or extracted. Nothing about the local audio path
 * changes, and the two kinds are labelled so they are never confused.
 *
 * This module only builds and validates library records; the network lookup for
 * a nicer title lives in `services/videoMeta.ts`.
 */
import { parseYouTubeLink, type YouTubeVideo } from './youtube';
import type { Track } from './types';

export const YOUTUBE_ALBUM = 'YouTube';
const NOISE =
  /\((?:official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|mv|explicit|remaster(?:ed)?|colou?r coded)[^)]*\)|\[[^\]]*\]/giu;

/** Removes the usual YouTube decoration from a video title (pure, testable). */
export function cleanVideoTitle(value: string): string {
  return value
    .replace(NOISE, ' ')
    .replace(/\s*[-–—]\s*(?:official\s+)?(?:music\s+)?video\s*$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Splits a YouTube title into artist and song when it follows the near-universal
 * "Artist - Title" pattern. Anything else becomes the title alone.
 */
export function splitVideoTitle(raw: string): { title: string; artist: string } {
  const cleaned = cleanVideoTitle(raw);
  const match = /^(.{1,80}?)\s+[-–—]\s+(.{1,120})$/u.exec(cleaned);
  if (!match) return { title: cleaned || raw.trim() || 'Untitled', artist: 'Unknown artist' };
  const [, artist, title] = match;
  // "Artist - Topic" channels often upload as "Title - Artist"; prefer whichever
  // side has more words only when the left side is implausibly long.
  return { title: title.trim(), artist: artist.trim() };
}

/** The video id when the pasted link is a single video, else null. */
export function youTubeVideoOf(link: string): YouTubeVideo | null {
  const parsed = parseYouTubeLink(link);
  return parsed && parsed.kind === 'video' ? parsed : null;
}

/**
 * A library record for a YouTube song. `duration` is 0 until playback reports it;
 * `size` is 0 because there are no local bytes, which is exactly what the sync and
 * storage code needs to know.
 */
export function youtubeTrack(
  input: { videoId: string; title: string; artist?: string; duration?: number },
  id: string,
): Track {
  const title = input.title.trim() || 'Untitled';
  return {
    id,
    title,
    artist: input.artist?.trim() || 'Unknown artist',
    album: YOUTUBE_ALBUM,
    duration: input.duration && Number.isFinite(input.duration) ? input.duration : 0,
    fileName: `YouTube · ${input.videoId}`,
    size: 0,
    addedAt: Date.now(),
    favorite: false,
    source: 'youtube',
    videoId: input.videoId,
  };
}

/** True when a track is played from YouTube rather than from a local file. */
export const isYouTubeTrack = (track: Pick<Track, 'source'> | undefined): boolean =>
  track?.source === 'youtube';

/**
 * A song can exist twice: as a file on this device and as a YouTube link.
 *
 * The file always wins. It plays offline, it is analysed for Mix, and it is the
 * copy the user actually owns. The YouTube record stays in the library so the
 * song is not lost if the file is removed later.
 */
export function localTwin(track: Track, tracks: Track[]): Track | undefined {
  if (!track.videoId) return undefined;
  const title = canonicalTitle(track.title);
  const artist = canonicalTitle(track.artist);
  if (!title) return undefined;
  return tracks.find(
    (candidate) =>
      candidate.blob &&
      canonicalTitle(candidate.title) === title &&
      (!artist || canonicalTitle(candidate.artist) === artist),
  );
}

const canonicalTitle = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\((?:official|lyrics?|audio|video)[^)]*\)/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

export interface Playable {
  /** The record that provides the bytes, when there are any. */
  track: Track;
  /** True when the song is played from the embed rather than from a file. */
  fromYouTube: boolean;
}

/** Resolves what should actually sound for a library row. */
export function resolvePlayable(track: Track | undefined, tracks: Track[]): Playable | undefined {
  if (!track) return undefined;
  if (!isYouTubeTrack(track)) return { track, fromYouTube: false };
  const twin = localTwin(track, tracks);
  return twin ? { track: twin, fromYouTube: false } : { track, fromYouTube: true };
}
