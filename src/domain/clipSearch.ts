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

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const left = new Set(a),
    right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

/**
 * Score in 0..1. Title similarity dominates; the artist's own channel and a
 * duration close to the song settle the rest.
 */
export function scoreClip(candidate: ClipCandidate, source: ClipSource): number {
  const haystack = `${candidate.title} ${candidate.author}`;
  const lowered = haystack.toLowerCase();
  if (REJECT_WORDS.some((word) => lowered.includes(word))) return 0;

  const titleScore = jaccard(
    tokens(source.title).filter((token) => !NOISE.includes(token)),
    tokens(candidate.title).filter((token) => !NOISE.includes(token)),
  );
  if (titleScore < 0.34) return 0;

  const artist = strip(source.artist);
  const artistInTitle = artist && strip(candidate.title).includes(artist);
  const artistChannel = artist && strip(candidate.author).includes(artist);

  let score = titleScore * 0.55;
  if (artistInTitle) score += 0.15;
  else if (artistChannel) score += 0.1;

  if (source.duration > 30 && candidate.duration > 0) {
    const difference = Math.abs(candidate.duration - source.duration);
    // A clip running far shorter than the song cut it off; far longer means the
    // song is a small part of a concert or a compilation.
    if (candidate.duration < source.duration * 0.6) return 0;
    if (candidate.duration > source.duration * 2.2) return 0;
    score += 0.3 * Math.max(0, 1 - difference / 45);
  } else {
    score += 0.1;
  }
  return Math.min(1, score);
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
