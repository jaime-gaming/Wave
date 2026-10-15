import { inferFileMetadata } from './musicIdentity';
import type { Track } from './types';
export const cleanTitle = (value: string) =>
  value
    .replace(/\s*[([]([^)\]]+)[)\]]/gu, (whole, label: string) =>
      /^(?:(?:official\s+)?(?:music\s+)?(?:audio|video|lyrics?(?:\s+video)?)|hd|hq|4k|8k)(?:\s+(?:hd|hq|4k|8k))?$/iu.test(
        label.trim(),
      )
        ? ' '
        : whole,
    )
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/iu, '')
    .replace(/^\s*\d{1,3}\s+-\s+/u, '')
    .replace(
      /\s*\((?:official (?:music video|audio|video)|lyrics?|hd|hq|(?:\d{4} )?remaster(?:ed)?(?: \d{4})?)\)\s*/giu,
      ' ',
    )
    .replace(/\s*\[(?:official (?:music video|audio|video)|lyrics?|hd|hq)\]\s*/giu, ' ')
    .replace(
      /\s+-\s+(?:(?:\d{4} )?remaster(?:ed)?(?: \d{4})?|official (?:music video|audio|video)|lyrics?)\s*$/giu,
      '',
    )
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[)\]]/giu, '')
    .replace(/\s+/g, ' ')
    .trim();
export const canonical = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’ʼ]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const mainArtist = (value: string) =>
  value
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[)\]]/giu, '')
    .split(/\s+(?:feat\.?|ft\.?|featuring)\s+/iu)[0]
    .trim();
export function artistMatch(local: string, remote: string) {
  if (canonical(mainArtist(local)) === canonical(mainArtist(remote))) return true;
  const credits = (value: string) =>
    value
      .replace(/[()[\]]/gu, ' ')
      .split(/\s+(?:feat\.?|ft\.?|featuring|with|con|&|x)\s+|\s*;\s*|,\s+/iu)
      .map(canonical)
      .filter(Boolean);
  const a = credits(local),
    b = credits(remote);
  return (
    a.length > 1 &&
    a.length === b.length &&
    a.every((name) => b.includes(name)) &&
    b.every((name) => a.includes(name))
  );
}
export function lookupMetadata(track: Track) {
  if (track.artist.trim() && track.artist !== 'Unknown artist') {
    const artist = mainArtist(track.artist),
      title = cleanTitle(track.title),
      parts = title.split(/\s+[–—-]\s+/u);
    return {
      title: parts.length === 2 && canonical(parts[0]) === canonical(artist) ? parts[1] : title,
      artist,
    };
  }
  const inferred = inferFileMetadata(track.fileName);
  return inferred.artist
    ? { artist: mainArtist(inferred.artist), title: cleanTitle(inferred.title) }
    : { title: cleanTitle(track.title), artist: '' };
}
/** A deluxe/reissue suffix is not a different album identity. Performance editions are. */
export const albumIdentity = (value: string) =>
  canonical(
    value
      .replace(
        /\s*[([](?:deluxe|expanded|special|anniversary|bonus|collector[’']?s)(?: edition| version)?(?:[^)\]]*)[)\]]\s*/giu,
        ' ',
      )
      .replace(/\s*[([](?:\d{4} )?remaster(?:ed)?(?: \d{4})?[)\]]\s*/giu, ' ')
      .replace(/\s+-\s+(?:deluxe|expanded|special|anniversary)(?: edition| version)?\s*$/giu, ''),
  );
function albumEdition(value: string) {
  return /\blive (?:at|in|from)\b|\((?:live|acoustic|instrumental|remix)[^)]*\)|^(?:live|acoustic|instrumental|remixes)$/iu.test(
    value,
  );
}
export function albumMatch(local: string, remote: unknown): 'match' | 'unknown' | 'conflict' {
  if (
    !local.trim() ||
    local === 'Unknown album' ||
    typeof remote !== 'string' ||
    !remote.trim() ||
    remote === 'Unknown album'
  )
    return 'unknown';
  return albumIdentity(local) === albumIdentity(remote) ? 'match' : 'conflict';
}
export function recordingMatch(value: unknown, track: Track) {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>,
    meta = lookupMetadata(track);
  if (typeof record.trackName !== 'string' || typeof record.artistName !== 'string' || !meta.artist)
    return;
  if (
    canonical(cleanTitle(record.trackName)) !== canonical(meta.title) ||
    !artistMatch(track.artist === 'Unknown artist' ? meta.artist : track.artist, record.artistName)
  )
    return;
  const difference =
    typeof record.duration === 'number' && Number.isFinite(record.duration)
      ? Math.abs(record.duration - track.duration)
      : Infinity;
  if (track.duration > 0 && difference > 8) return;
  const album = albumMatch(track.album, record.albumName);
  if (album === 'conflict' && (albumEdition(track.album) || albumEdition(String(record.albumName))))
    return;
  return {
    record,
    album,
    synchronized: track.duration > 0 && difference <= 3 && album !== 'conflict',
    score:
      (track.duration > 0 ? Math.max(0, 8 - difference) : 0) +
      (album === 'match' ? 12 : album === 'conflict' ? -12 : 0) +
      (typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim() ? 2 : 0),
  };
}
