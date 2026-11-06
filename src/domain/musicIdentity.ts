export function stripTrackPrefix(value: string) {
  return value.replace(/^\s*(?:(?:\d{1,2}[.-])?\d{1,3}\s*[-._]\s*|\d{1,3}\s+-\s+)/u, '').trim();
}
export function inferFileMetadata(fileName: string): { title: string; artist?: string } {
  const stem = stripTrackPrefix(fileName.replace(/\.[^.]+$/u, '').replace(/_+[–—-]_+/gu, ' - '));
  const parts = stem.split(/\s+[–—-]\s+/u);
  if (parts.length !== 2 || !parts.every((p) => p.trim()))
    return { title: stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() };
  return { artist: parts[0].trim().replace(/_/g, ' '), title: parts[1].trim().replace(/_/g, ' ') };
}
/**
 * A title tag that actually holds both halves: "Artist - Title".
 *
 * Downloads and rips very often put the whole line in the title and leave the
 * artist empty, which is why a library can look like it has fifty artists called
 * "Unknown artist" and songs named after their performers. When the artist field
 * says nothing, the split is worth making — conservatively: exactly two parts, a
 * short left side that is not itself a number, and no brackets to break.
 */
/**
 * Words that sit on the left of a dash and are never the act.
 *
 * "Song - Live", "Song - Remastered", "Song - Official Audio" are titles with a
 * note after them, not collaborations. Claiming an artist called "Live" is the
 * kind of confident nonsense this file now refuses to do.
 */
const EDITION_WORDS = new Set([
  'live',
  'remix',
  'remaster',
  'remastered',
  'acoustic',
  'demo',
  'official',
  'audio',
  'video',
  'lyrics',
  'lyric',
  'hd',
  'hq',
  'full',
  'album',
  'extended',
  'radio',
  'edit',
  'version',
  'instrumental',
  'bonus',
  'deluxe',
  'single',
  'explicit',
  'clean',
  'preview',
]);

export function splitInlineArtist(title: string): { artist: string; title: string } | null {
  const parts = stripTrackPrefix(title)
    .split(/\s+[–—-]\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const [artist, song] = parts;
  if (!artist || !song) return null;
  if (/^\d+$/u.test(artist)) return null;
  if (artist.length > 48 || song.length < 2) return null;
  if (/[()[\]{}]/u.test(artist)) return null;
  if (cleanWords(artist) === cleanWords(song)) return null;
  // A single word on the left with no letter variety is a label, not a person.
  const words = artist.split(/\s+/u);
  if (words.every((word) => EDITION_WORDS.has(cleanWords(word)))) return null;
  if (words.length === 1 && artist.length < 3) return null;
  return { artist, title: song };
}

const cleanWords = (value: string) => value.toLocaleLowerCase().normalize('NFC').trim();

/**
 * A zero-padded track number at the front of a title: "01 Song", "07 - Song".
 *
 * Only with a leading zero, so "1975" and "99 Luftballons" stay intact — the
 * number is a position in an album, not part of the name.
 */
export function stripLeadingNumber(title: string): string {
  return title.replace(/^0\d{1,2}(?:\s*[.)-]\s*|\s+)(?=\S)/u, '').trim();
}

export const searchText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function matchesSearch(value: string, query: string) {
  const text = searchText(value);
  return searchText(query)
    .split(/\s+/u)
    .filter(Boolean)
    .every((part) => text.includes(part));
}

/**
 * The one place where the tags and the file name disagree about who made a song.
 *
 * A swapped artist and title is a real, annoying mistake, and it is also the
 * easiest thing in the world to claim wrongly — every self-titled record has the
 * same words in two fields. So the claim is only made when the file name itself
 * holds the two halves the other way round: the file says "Song - Artist" while
 * the tags say the opposite. That is evidence, not a guess.
 */
export function rolesSwapped(track: { title: string; artist: string; fileName?: string }): boolean {
  const name = track.fileName;
  if (!name) return false;
  const fromName = inferFileMetadata(name);
  if (!fromName.artist) return false;
  // Compare recording identities, not tag typography. Keep live/remix labels.
  const identity = (value: string) =>
    searchText(
      value
        .replace(/\s*[([](?:official(?: music)? (?:video|audio)|lyrics?|hd|hq|4k)[)\]]/giu, ' ')
        .replace(/\s*-\s*(?:official(?: music)? (?:video|audio)|lyrics?)\s*$/iu, ''),
    );
  const same = (left: string, right: string) =>
    !!identity(left) && identity(left) === identity(right);
  return (
    !same(track.title, track.artist) &&
    same(track.title, fromName.artist) &&
    same(track.artist, fromName.title)
  );
}
