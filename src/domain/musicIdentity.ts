export function stripTrackPrefix(value: string) {
  return value.replace(/^\s*(?:(?:\d{1,2}[.-])?\d{1,3}\s*[-._]\s*|\d{1,3}\s+-\s+)/u, '').trim();
}
export function inferFileMetadata(fileName: string): { title: string; artist?: string } {
  const stem = stripTrackPrefix(fileName.replace(/\.[^.]+$/u, '').replace(/_+[–—-]_+/gu, ' - '));
  const parts = stem.split(/\s+[–—-]\s+/u);
  if (parts.length !== 2 || !parts.every((p) => p.trim()))
    return { title: stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() };
  const left = parts[0].trim().replace(/_/g, ' ');
  const right = parts[1].trim().replace(/_/g, ' ');

  if (roleSwapVerdict(right, left) >= 2.8) {
    return { artist: right, title: left };
  }
  return { artist: left, title: right };
}

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

  const words = artist.split(/\s+/u);
  if (words.every((word) => EDITION_WORDS.has(cleanWords(word)))) return null;
  if (words.length === 1 && artist.length < 3) return null;
  return { artist, title: song };
}

const cleanWords = (value: string) => value.toLocaleLowerCase().normalize('NFC').trim();

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

const TITLE_EDITION_TAG =
  /[([](?:prod\.?|remix|live|acoustic|remaster(?:ed)?|official|audio|video|lyrics?|slowed|sped\s+up|nightcore|radio\s+edit|extended|instrumental|demo|bonus|deluxe|version|edit|pt\.?\s*\d|part\s*\d|unplugged|session|en\s+vivo|ac[uú]stic[oa]|versi[oó]n)[^)\]]*[)\]]/iu;

const TITLE_PHRASE_WORDS =
  /\b(?:i'm|i’m|don't|don’t|can't|can’t|won't|won’t|didn't|you're|we're|it's|that's|there's|gonna|wanna|gotta|never|always|without|because|someone|something|nothing|everything|tonight|forever|remember|goodbye|waiting|falling|running|dancing|crying|dreaming|thinking|feeling|quiero|eres|estoy|tengo|dime|dame|nunca|siempre|contigo|conmigo|cuando|donde|porque|nada|todo|coraz[oó]n|noche|vida|amor|dolor|volver|llorar|so[ñn]ar|bailar|olvidar)\b/iu;

const TITLE_CONNECTOR_WORDS =
  /\b(?:of|in|on|at|to|for|from|with|by|into|over|under|through|about|around|between|my|your|our|their|his|her|me|you|us|them|is|are|was|were|be|been|do|does|did|have|has|had|de|del|en|con|sin|por|para|mi|tu|su|me|te|se|nos|que|como|pero|si|no|un|una|al)\b/u;

const BAND_PATTERN =
  /^(?:the|los|las|el|la|les|der|die|das)\s+\S+|\b(?:and\s+the|y\s+los|y\s+las)\b|\s[&+]\s/iu;

const ARTIST_PREFIX = /^(?:dj|mc|lil|young|yung|big|dr\.?|mr\.?|mrs\.?|ms\.?|st\.?)\s+\S+/iu;

const ARTIST_COLLAB_PATTERN = /[([\s](?:feat\.?|ft\.?|featuring)\b|\s(?:&|x|×)\s|,\s*\p{Lu}/u;

const stripCollabCredit = (value: string) =>
  value
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/giu, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/iu, '')
    .trim();

function titleLikeness(value: string): number {
  const text = value.trim();
  if (!text) return 0;
  let score = 0;
  const words = text.split(/\s+/u).filter(Boolean);

  if (TITLE_EDITION_TAG.test(text)) score += 3.6;
  if (/[?!¡¿…]|\.{3}/u.test(text)) score += 2.2;
  if (/\s[-–—:]\s/u.test(text) && text.length > 14) score += 1.4;

  const phraseHits = text.match(new RegExp(TITLE_PHRASE_WORDS.source, 'giu'))?.length ?? 0;
  score += Math.min(3.4, phraseHits * 1.7);

  const innerWords = words.slice(1);
  const lowercaseConnectors = innerWords.filter((w) => TITLE_CONNECTOR_WORDS.test(w)).length;
  score += Math.min(2.2, lowercaseConnectors * 0.9);

  if (/^(?:i|you|we|she|he|they|te|me|nos|no|si|mi|tu|cuando|donde|como|por)\s+/iu.test(text)) {
    score += 1.3;
  }

  if (words.length >= 5) score += 1.8;
  else if (words.length === 4) score += 1.0;

  if (text.length >= 28) score += 1.2;
  else if (text.length >= 20) score += 0.6;

  if (BAND_PATTERN.test(text) && !TITLE_EDITION_TAG.test(text) && phraseHits === 0) score -= 1.8;
  if (ARTIST_PREFIX.test(text) && words.length <= 3) score -= 2.2;

  if (words.length <= 2 && text.length <= 16 && !/[?!¡¿()[\]]/u.test(text) && phraseHits === 0) {
    score -= 0.7;
  }

  return score;
}

export function roleSwapVerdict(
  title: string,
  artist: string,
  knownArtists?: ReadonlySet<string>,
): number {
  const cleanTitleText = title.trim();
  const cleanArtistText = artist.trim();
  if (!cleanTitleText || !cleanArtistText) return 0;

  const idTitle = searchText(cleanTitleText);
  const idArtist = searchText(cleanArtistText);
  if (!idTitle || !idArtist || idTitle === idArtist) return 0;

  let score = 0;
  if (knownArtists && knownArtists.size > 0) {
    const titleIsKnownArtist = knownArtists.has(idTitle);
    const artistIsKnownArtist = knownArtists.has(idArtist);
    if (titleIsKnownArtist && !artistIsKnownArtist) score += 3.8;
    else if (artistIsKnownArtist && !titleIsKnownArtist) score -= 3.8;
  }

  score += titleLikeness(cleanArtistText) - titleLikeness(cleanTitleText);

  const artistCore = stripCollabCredit(cleanArtistText) || cleanArtistText;
  const titleWords = cleanTitleText.split(/\s+/u).filter(Boolean).length;
  const artistWords = artistCore.split(/\s+/u).filter(Boolean).length;
  const artistHasBandShape =
    BAND_PATTERN.test(cleanArtistText) ||
    ARTIST_PREFIX.test(cleanArtistText) ||
    ARTIST_COLLAB_PATTERN.test(cleanArtistText);
  const titleHasBandShape = BAND_PATTERN.test(cleanTitleText) || ARTIST_PREFIX.test(cleanTitleText);

  if (artistWords >= titleWords + 2 && titleWords <= 2 && !artistHasBandShape) {
    score += 1.9;
  } else if (titleWords >= artistWords + 2 && artistWords <= 2 && !titleHasBandShape) {
    score -= 1.9;
  }

  if (
    artistCore.length >= cleanTitleText.length * 1.75 &&
    artistCore.length >= 16 &&
    cleanTitleText.length <= 18 &&
    !artistHasBandShape
  ) {
    score += 1.6;
  } else if (
    cleanTitleText.length >= artistCore.length * 1.75 &&
    cleanTitleText.length >= 16 &&
    artistCore.length <= 18 &&
    !titleHasBandShape
  ) {
    score -= 1.6;
  }

  return score;
}

export function rolesSwapped(
  track: { title: string; artist: string; fileName?: string },
  knownArtists?: ReadonlySet<string>,
): boolean {
  const title = track.title.trim();
  const artist = track.artist.trim();
  if (!title || !artist) return false;
  if (
    /^(?:unknown(?: (?:artist|album|title))?|untitled|n\/a|null|undefined)$/iu.test(title) ||
    /^(?:unknown(?: (?:artist|album|title))?|untitled|n\/a|null|undefined)$/iu.test(artist)
  ) {
    return false;
  }

  const identity = (value: string) =>
    searchText(
      value
        .replace(/\s*[([](?:official(?: music)? (?:video|audio)|lyrics?|hd|hq|4k)[)\]]/giu, ' ')
        .replace(/\s*-\s*(?:official(?: music)? (?:video|audio)|lyrics?)\s*$/iu, ''),
    );
  const same = (left: string, right: string) =>
    !!identity(left) && identity(left) === identity(right);

  if (same(title, artist)) return false;

  const verdict = roleSwapVerdict(title, artist, knownArtists);
  if (verdict >= 2.6) return true;
  if (verdict <= -2.6) return false;

  const name = track.fileName;
  if (!name) return false;
  const fromName = inferFileMetadata(name);
  if (!fromName.artist) return false;
  return same(title, fromName.artist) && same(artist, fromName.title);
}
