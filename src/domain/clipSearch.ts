/**
 * Automatic video-clip matching.
 *
 * Pasting a link per song is busywork, so Wave searches for the clip itself and
 * keeps the ranking rules here, away from the network: given a list of candidates
 * and the song, pick the video a person would have picked, or nothing at all when
 * every candidate looks wrong.
 *
 * Only the song title and artist leave the device, exactly like the lyric lookup.
 * No audio is uploaded, downloaded or extracted: the chosen clip is embedded from
 * YouTube and stays muted behind Wave's own transport.
 */
export interface ClipCandidate {
  videoId: string;
  title: string;
  /** Channel or uploader, used to recognise the artist's own upload. */
  author: string;
  /** Length in seconds; 0 when the provider did not report one. */
  duration: number;
}

export interface ClipSource {
  title: string;
  artist: string;
  /** Song length; 0 while it is still unknown. */
  duration: number;
}

/** Words that mark a video as something other than the song itself. */
const REJECT_WORDS = [
  'karaoke',
  'cover',
  'instrumental',
  'reaction',
  'tutorial',
  'lesson',
  'slowed',
  'sped up',
  'nightcore',
  '8d audio',
  'bass boosted',
  'remake',
  'parody',
  'tribute',
  'guitar',
  'piano',
];
/**
 * Uploads that are a music video, and uploads that are just the song.
 *
 * Both are valid results for a search, and both sound the same, but only one of
 * them is a picture: an "official audio" or an auto-generated art track is a
 * static sleeve for four minutes. Wave looks for the video, so the video words
 * are what decide between two uploads that score the same otherwise.
 */
const VIDEO_WORDS = [
  'official video',
  'official music video',
  'music video',
  'video oficial',
  'videoclip',
  'clip officiel',
  'official 4k video',
  'official hd video',
  'video musical',
  'official mv',
];
const AUDIO_ONLY_WORDS = [
  'official audio',
  'audio oficial',
  'visualizer',
  'visualiser',
  'art track',
  'auto-generated',
  'audio only',
  'static image',
];
/**
 * Uploads that put the words on screen instead of the song's own picture.
 *
 * A lyric video is a still background with the text over it, and Wave already
 * shows the words in its own panel: two sets of lyrics drifting at different
 * speeds is worse than no picture at all. So this is not a penalty like the
 * audio uploads above, it is a rejection — a lyric video is never shown as a
 * clip, not even when it is the only thing the search returned.
 */
const LYRIC_WORDS = [
  'lyric',
  'lyrics',
  'letra',
  'letras',
  'paroles',
  'traduccion',
  'traducao',
  'legendas',
  'subtitulado',
  'sub espanol',
];

/** Typical YouTube noise; ignored when comparing titles but not penalised. */
const NOISE = [
  'official',
  'video',
  'music',
  'audio',
  'lyrics',
  'lyric',
  'hd',
  'hq',
  '4k',
  'visualizer',
  'visualiser',
  'explicit',
  'remaster',
  'remastered',
  'mv',
  'premiere',
  'color',
  'coded',
];

const strip = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const tokens = (value: string) => strip(value).split(' ').filter(Boolean);

/** Song + artist, with the words search engines need to find the official clip. */
export function clipQuery(source: ClipSource): string {
  const title = strip(source.title);
  const artist = strip(source.artist);
  if (!artist || artist === 'unknown artist') return title;
  // Avoid sending the artist twice when the title already begins with it.
  return title.startsWith(artist) ? title : `${artist} ${title}`;
}

/**
 * The same search, asking explicitly for a video.
 *
 * Used only when the plain query came back with songs rather than clips: adding
 * the word costs one request and changes which uploads the front-end ranks first.
 */
export function videoClipQuery(source: ClipSource): string {
  const base = clipQuery(source);
  return base ? `${base} official video` : base;
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const left = new Set(a),
    right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

const containsAny = (haystack: string, words: string[]) =>
  words.some((word) => haystack.includes(word));

// Whole words only: "Letters to you" is a song, "Lyrics" in a title is a lyric
// video, and a substring match would confuse the two.
const containsWord = (haystack: string, words: string[]) => {
  const spaced = ` ${haystack.replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return words.some((word) => spaced.includes(` ${word} `));
};

/** True when the upload presents itself as a music video. */
export function isMusicVideo(candidate: ClipCandidate): boolean {
  return containsAny(candidate.title.toLowerCase(), VIDEO_WORDS);
}

/** True when the upload shows the words instead of a picture. */
export function isLyricVideo(candidate: ClipCandidate): boolean {
  return containsWord(strip(candidate.title), LYRIC_WORDS);
}

/** True when the upload is the song with a still picture, not a clip. */
export function isAudioOnly(candidate: ClipCandidate): boolean {
  return (
    !isMusicVideo(candidate) &&
    (containsAny(candidate.title.toLowerCase(), AUDIO_ONLY_WORDS) || isLyricVideo(candidate))
  );
}

/**
 * YouTube generates a channel per artist for the label's audio: the name always
 * ends in "- Topic", the artwork is the album sleeve and the "video" is that
 * sleeve, still. It is the one result that is guaranteed to be a song and never a
 * clip, and it is usually the first thing a search returns.
 */
export function isAutoGenerated(candidate: ClipCandidate): boolean {
  const author = candidate.author.trim().toLowerCase();
  const title = candidate.title.toLowerCase();
  return (
    /- ?topic$/u.test(author) ||
    author === 'topic' ||
    title.includes('auto-generated') ||
    title.includes('provided to youtube by')
  );
}

/**
 * Uploaders that are the artist, not a re-upload.
 *
 * A clip is somebody's work: the artist's, or the label's, published with the
 * artist. A random channel that happened to re-post the video is a third party,
 * and Wave will not put its picture on the screen and imply it is official. The
 * channel name is the only signal available without an API key, so it has to
 * contain the artist — allowing for the suffixes channels actually use
 * ("M83VEVO", "M83 Official", "M83 Music", "M83 - Topic").
 */
const CHANNEL_NOISE = [
  'vevo',
  'official',
  'officiel',
  'oficial',
  'music',
  'musica',
  'musicvideo',
  'channel',
  'canal',
  'records',
  'recordings',
  'entertainment',
  'productions',
  'label',
  'tv',
  'hd',
  'topic',
  'band',
  'the',
];

/** The artist exactly, allowing the suffixes a channel puts after its name. */
export function isArtistChannel(candidate: ClipCandidate, source: ClipSource): boolean {
  const artist = strip(source.artist);
  if (!artist || artist === 'unknown artist') return false;
  const author = strip(candidate.author);
  if (!author) return false;
  if (author.includes(artist)) return true;
  // "The Midnight" and "Midnight": an article in front is not a different act.
  const meaningful = tokens(author).filter((token) => !CHANNEL_NOISE.includes(token));
  const wanted = tokens(artist).filter((token) => !CHANNEL_NOISE.includes(token));
  if (!wanted.length) return false;
  return wanted.every((token) => meaningful.includes(token));
}

/**
 * Score in 0..1. Title similarity dominates; the artist's own channel and a
 * duration close to the song settle the rest, and the kind of upload — a music
 * video rather than a still sleeve — decides between otherwise equal matches.
 */
export function scoreClip(candidate: ClipCandidate, source: ClipSource): number {
  const haystack = `${candidate.title} ${candidate.author}`;
  const lowered = haystack.toLowerCase();
  if (REJECT_WORDS.some((word) => lowered.includes(word))) return 0;
  // An art track is the album's audio with the sleeve on top. Wave wants the
  // picture that moves, so this is not a clip at all.
  if (isAutoGenerated(candidate)) return 0;
  // A lyric video is the song's words over a still, and Wave draws its own
  // lyrics. Never worth a frame, whatever else the search returned.
  if (isLyricVideo(candidate)) return 0;

  const titleScore = jaccard(
    tokens(source.title).filter((token) => !NOISE.includes(token)),
    tokens(candidate.title).filter((token) => !NOISE.includes(token)),
  );
  if (titleScore < 0.34) return 0;

  // Somebody else's upload is never the clip, however good the title matches.
  if (!isArtistChannel(candidate, source)) return 0;

  const artist = strip(source.artist);
  const artistInTitle = artist && strip(candidate.title).includes(artist);

  let score = titleScore * 0.55;
  if (artistInTitle) score += 0.15;

  if (source.duration > 30 && candidate.duration > 0) {
    const difference = Math.abs(candidate.duration - source.duration);
    // A clip running far shorter than the song cut it off; far longer means the
    // song is a small part of a concert or a compilation. A music video is
    // often a little longer than the record — a spoken intro, an outro — so the
    // tolerance is a touch wider for one.
    const video = isMusicVideo(candidate);
    if (candidate.duration < source.duration * 0.6) return 0;
    if (candidate.duration > source.duration * (video ? 2.6 : 2.2)) return 0;
    score += 0.25 * Math.max(0, 1 - difference / 45);
  } else {
    score += 0.1;
  }

  // The deciding vote. Two uploads of the same song score the same on title,
  // artist and length; the one that calls itself a video wins, and a still
  // sleeve ("official audio", "lyric video") steps back.
  if (isMusicVideo(candidate)) score += 0.18;
  else if (containsAny(candidate.title.toLowerCase(), AUDIO_ONLY_WORDS)) score -= 0.12;
  return Math.min(1, score);
}

/**
 * Where a clip should start so the picture lines up with the song.
 *
 * A clip is almost never exactly as long as the record: uploads carry a title
 * card, a few seconds of room tone, sometimes an outro. If the video is longer,
 * some of that extra time is before the music, so starting the clip at zero puts
 * the picture behind the song for its whole length. The excess is split between
 * the two ends — more at the start, because that is where intros live — and the
 * result is bounded, because a guess that is forty seconds wrong is worse than
 * no guess at all. The listener can still nudge it from the song's editor.
 */
export function autoClipStart(clipSeconds: number, songSeconds: number): number {
  if (!Number.isFinite(clipSeconds) || !Number.isFinite(songSeconds)) return 0;
  if (clipSeconds <= 0 || songSeconds <= 0) return 0;
  const extra = clipSeconds - songSeconds;
  if (extra <= 2) return 0;
  return Math.round(Math.min(60, extra * 0.6));
}

/**
 * Every convincing match, best first.
 *
 * Automatic discovery picks one, but a wrong match should not be a dead end: the
 * same ranking is offered as a short list so the listener can say "not this one"
 * and choose another without pasting a link.
 */
export function rankClips(
  candidates: ClipCandidate[],
  source: ClipSource,
  limit = 5,
): ClipCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (!/^[A-Za-z0-9_-]{11}$/u.test(candidate.videoId) || seen.has(candidate.videoId))
        return false;
      const score = scoreClip(candidate, source);
      if (score < 0.45) return false;
      seen.add(candidate.videoId);
      return true;
    })
    .map((candidate) => ({ candidate, score: scoreClip(candidate, source) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.candidate);
}

/** Best candidate above the confidence floor, or null when none is convincing. */
export function pickClip(candidates: ClipCandidate[], source: ClipSource): ClipCandidate | null {
  let best: ClipCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    if (!/^[A-Za-z0-9_-]{11}$/u.test(candidate.videoId)) continue;
    const score = scoreClip(candidate, source);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

const seconds = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

/** Piped API shape (`/search?filter=videos`). */
export function parsePipedResults(payload: unknown): ClipCandidate[] {
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const url = typeof entry.url === 'string' ? entry.url : '';
    const videoId =
      typeof entry.id === 'string' && entry.id.length === 11
        ? entry.id
        : (/([A-Za-z0-9_-]{11})/u.exec(url)?.[1] ?? '');
    if (!videoId || typeof entry.title !== 'string') return [];
    return [
      {
        videoId,
        title: entry.title,
        author: typeof entry.uploaderName === 'string' ? entry.uploaderName : '',
        duration: seconds(entry.duration),
      },
    ];
  });
}

/** Invidious API shape (`/api/v1/search?type=video`). */
export function parseInvidiousResults(payload: unknown): ClipCandidate[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    if (entry.type !== undefined && entry.type !== 'video') return [];
    const videoId = typeof entry.videoId === 'string' ? entry.videoId : '';
    if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId) || typeof entry.title !== 'string') return [];
    return [
      {
        videoId,
        title: entry.title,
        author: typeof entry.author === 'string' ? entry.author : '',
        duration: seconds(entry.lengthSeconds),
      },
    ];
  });
}
