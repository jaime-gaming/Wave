import { parseYouTubeLink, youtubeThumbnailUrl, type YouTubeVideo } from './youtube';
import type { Track } from './types';

export const YOUTUBE_ALBUM = 'YouTube';
const NOISE =
  /\((?:official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|mv|explicit|remaster(?:ed)?|colou?r coded)[^)]*\)|\[[^\]]*\]/giu;

export function cleanYouTubeAuthor(author: string | undefined): string {
  if (!author) return '';
  return author
    .replace(/\s*[-–—]\s*topic\s*$/iu, '')
    .replace(/\s+official(?:\s+channel)?\s*$/iu, '')
    .trim();
}

export function cleanVideoTitle(value: string): string {
  return value
    .replace(NOISE, ' ')
    .replace(/\s*[-–—]\s*(?:official\s+)?(?:music\s+)?video\s*$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function splitVideoTitle(raw: string, author?: string): { title: string; artist: string } {
  const cleaned = cleanVideoTitle(raw);
  const match = /^(.{1,80}?)\s+[-–—]\s+(.{1,120})$/u.exec(cleaned);
  if (!match) {
    const channel = cleanYouTubeAuthor(author);
    return {
      title: cleaned || raw.trim() || 'Untitled',
      artist: channel || 'Unknown artist',
    };
  }
  const [, artist, title] = match;
  return { title: title.trim(), artist: artist.trim() };
}

export function youTubeVideoOf(link: string): YouTubeVideo | null {
  const parsed = parseYouTubeLink(link);
  return parsed && parsed.kind === 'video' ? parsed : null;
}

export function youtubeTrack(
  input: { videoId: string; title: string; artist?: string; duration?: number; artwork?: string },
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
    artwork: input.artwork ?? youtubeThumbnailUrl(input.videoId),
  };
}

export const isYouTubeTrack = (track: Pick<Track, 'source'> | undefined): boolean =>
  track?.source === 'youtube';

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

export function youtubeMergeTarget(local: Track, tracks: Track[]): Track | undefined {
  const title = canonicalTitle(local.title);
  const artist = canonicalTitle(local.artist);
  if (!title || !artist || artist === 'unknown artist') return undefined;
  const matches = tracks.filter(
    (track) =>
      track.source === 'youtube' &&
      canonicalTitle(track.title) === title &&
      canonicalTitle(track.artist) === artist &&
      (!track.duration || !local.duration || Math.abs(track.duration - local.duration) <= 5),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function mergeYouTubeWithFile(youtube: Track, local: Track): Track {
  return {
    ...youtube,
    blob: local.blob,
    source: 'local',
    youtubeOnly: false,
    fileName: local.fileName,
    size: local.size,
    contentHash: local.contentHash,
    audioInfo: local.audioInfo,
    duration: local.duration || youtube.duration,
    album: youtube.album === YOUTUBE_ALBUM ? local.album : youtube.album,
    artwork: youtube.artwork || local.artwork,
  };
}

export interface Playable {
  track: Track;

  fromYouTube: boolean;
}

export function resolvePlayable(track: Track | undefined, tracks: Track[]): Playable | undefined {
  if (!track) return undefined;
  if (!isYouTubeTrack(track)) return { track, fromYouTube: false };
  const twin = track.youtubeOnly ? undefined : localTwin(track, tracks);
  return twin ? { track: twin, fromYouTube: false } : { track, fromYouTube: true };
}
