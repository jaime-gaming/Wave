import { parseLocalMetadata } from './metadataReader';
import { cleanTag, missingTag, metadataIssues } from '../domain/metadata';
import { inferFileMetadata } from '../domain/musicIdentity';
import { canonical, cleanTitle } from '../domain/lyricsMatch';
import { readArtwork } from './artwork';
import { embeddedLyrics } from '../domain/lyrics';
import type { Track } from '../domain/types';

/**
 * Wave 1.1 import formats, as requested: MP3, WAV, M4A and OGG only.
 *
 * Songs already stored in another format (FLAC, AIFF, Opus, WebM, AAC) keep
 * playing: this list gates the import picker and drag-and-drop, never the
 * existing library. Widening it again is a one-line change here.
 */
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg'];
/** Formats a previous Wave version could import; kept only for messaging. */
export const LEGACY_AUDIO_EXTENSIONS = ['flac', 'aac', 'opus', 'aiff', 'aif', 'webm'];
export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map((ext) => `.${ext}`).join(',');
export const MAX_FILE_SIZE = 200 * 1024 * 1024;

export function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}
export function isAudioFile(file: File): boolean {
  return AUDIO_EXTENSIONS.includes(fileExtension(file.name));
}
/** True for a format Wave used to accept, so the message can say why it is refused. */
export function isLegacyAudioFile(file: File): boolean {
  return LEGACY_AUDIO_EXTENSIONS.includes(fileExtension(file.name));
}
export const IMPORT_FORMAT_HINT = 'MP3, WAV, M4A or OGG';
export async function fileIdentity(file: File): Promise<string> {
  const bytes = new TextEncoder().encode(`${file.name}\0${file.size}\0${file.lastModified}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function contentIdentity(blob: Blob): Promise<string> {
  const bytes =
    typeof blob.arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        });
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function readTrack(file: File, id: string): Promise<Track> {
  const inferred = inferFileMetadata(file.name);
  const track: Track = {
    id,
    title: inferred.title,
    artist: inferred.artist ?? 'Unknown artist',
    album: 'Unknown album',
    duration: 0,
    fileName: file.name,
    size: file.size,
    addedAt: Date.now(),
    favorite: false,
    blob: file,
  };
  try {
    // Metadata parsing is loaded only when the user imports music.
    const metadata = await parseLocalMetadata(file);
    const title = cleanTag(metadata.common.title);
    if (!missingTag(title)) track.title = title;
    const taggedArtist =
      cleanTag(metadata.common.artist) ||
      metadata.common.artists?.map(cleanTag).filter(Boolean).join(' feat. ') ||
      cleanTag(metadata.common.albumartist);
    track.artist =
      (!missingTag(taggedArtist ?? '') ? taggedArtist : undefined) ||
      (inferred.artist &&
      canonical(cleanTitle(inferred.title)) === canonical(cleanTitle(track.title))
        ? inferred.artist
        : 'Unknown artist');
    const album = cleanTag(metadata.common.album);
    if (!missingTag(album)) track.album = album;
    track.genres = [...new Set(metadata.common.genre?.map(cleanTag).filter(Boolean) ?? [])].slice(
      0,
      12,
    );
    track.year =
      metadata.common.year &&
      metadata.common.year > 1000 &&
      metadata.common.year <= new Date().getFullYear() + 1
        ? metadata.common.year
        : undefined;
    track.duration =
      Number.isFinite(metadata.format.duration) && (metadata.format.duration ?? 0) > 0
        ? metadata.format.duration!
        : 0;
    try {
      track.lyrics = embeddedLyrics(metadata.common.lyrics);
    } catch {
      /* Unusable lyric tags must not block audio import. */
    }
    track.trackNumber =
      metadata.common.track.no && metadata.common.track.no > 0
        ? metadata.common.track.no
        : undefined;
    track.discNumber =
      metadata.common.disk.no && metadata.common.disk.no > 0 ? metadata.common.disk.no : undefined;
    const format = metadata.format;
    const positive = (value?: number) =>
      value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
    track.audioInfo = {
      codec: format.codec,
      sampleRate: positive(format.sampleRate),
      bitsPerSample: positive(format.bitsPerSample),
      bitrate: positive(format.bitrate),
      lossless: format.lossless,
    };
    const covers = (metadata.common.picture ?? [])
      .filter(
        (p) =>
          ['image/jpeg', 'image/png', 'image/webp'].includes(p.format) &&
          p.data.length <= 5 * 1024 * 1024,
      )
      .sort((a, b) => Number(b.type === 'Cover (front)') - Number(a.type === 'Cover (front)'));
    for (const cover of covers) {
      try {
        track.artwork = await readArtwork(
          new File([new Uint8Array(cover.data)], 'embedded-cover', { type: cover.format }),
        );
        break;
      } catch {
        /* Try another embedded image without discarding valid tags. */
      }
    }
  } catch {
    // Missing or malformed tags must not prevent importing playable audio.
  }
  track.metadataCheck = { checkedAt: Date.now(), issues: metadataIssues(track) };
  return track;
}
