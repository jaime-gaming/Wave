import { artistMatch, canonical, cleanTitle, mainArtist } from './lyricsMatch';
import { searchText } from './musicIdentity';

/**
 * Matching a pasted playlist against the local collection.
 *
 * The importer only ever produces a *proposal*: every entry is reported as
 * matched, ambiguous or missing, and nothing is written until the user confirms.
 * A local song is never assigned to two entries, and a low-confidence match is
 * surfaced as ambiguous instead of being silently accepted.
 *
 * Matching never touches audio: it reads titles, artists, albums and durations
 * and returns track identifiers. Nothing here can re-encode, resample or
 * otherwise alter a stored file.
 */
export interface ImportedEntry {
  /** Provider-side identifier, used only for reporting. */
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** Seconds. Omitted when the provider did not report a usable duration. */
  duration?: number;
}

export interface MatchCandidate {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

export type MatchStatus = 'matched' | 'ambiguous' | 'missing';

export interface EntryMatch {
  entry: ImportedEntry;
  status: MatchStatus;
  /** Chosen local track for `matched`; best proposal for `ambiguous`. */
  trackId?: string;
  /** 0–1 confidence of the chosen or best candidate. */
  score: number;
  /** Scored alternatives above the reporting floor, best first. */
  alternatives: { trackId: string; score: number }[];
}

export interface ImportReport {
  matches: EntryMatch[];
  matchedCount: number;
  ambiguousCount: number;
  missingCount: number;
  /** Ordered, unique local track IDs for the entries the user can accept as-is. */
  trackIds: string[];
}

export interface MatchOptions {
  /** Seconds. Durations given by providers are rounded, so a small window is required. */
  durationTolerance?: number;
  /** Minimum score to accept without review. */
  acceptScore?: number;
  /** Minimum score to report as a possible alternative. */
  reportScore?: number;
  /**
   * Compares every entry with every candidate. Only used to verify the indexed
   * search in tests; it is orders of magnitude slower for large libraries.
   */
  exhaustive?: boolean;
}

export const DEFAULT_MATCH_OPTIONS: Required<Omit<MatchOptions, 'exhaustive'>> = {
  durationTolerance: 5,
  acceptScore: 0.82,
  reportScore: 0.45,
};

/** Hard ceiling for one import so a hostile provider cannot exhaust memory. */
export const MAX_IMPORT_ENTRIES = 5000;

const TRAILING_DECORATION =
  /\s*[|–—-]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyric\s+video|visuali[sz]er|lyrics?|hd|hq|4k)\s*$/iu;

/** Text decorations that only appear on provider titles. */
function tidy(value: string): string {
  const trimmed = value.replace(/\s*-\s*topic\s*$/iu, '').trim();
  // Strip one trailing decoration at a time; anything that looks like a real
  // version ("Remix", "Live", "Acoustic") is preserved so it cannot be confused
  // with the studio recording.
  let text = trimmed;
  for (let pass = 0; pass < 2; pass++) {
    const next = text.replace(TRAILING_DECORATION, '').trim();
    if (next === text) break;
    text = next;
  }
  return canonical(
    cleanTitle(text)
      .replace(
        /\s*[([]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyric\s+video|visuali[sz]er|hd|hq|4k)\s*[)\]]\s*/giu,
        ' ',
      )
      .replace(/\s*\b(?:official\s+)?(?:lyrics?|visuali[sz]er)\b\s*/giu, ' '),
  );
}

function tokens(canonicalTitle: string): Set<string> {
  return new Set(canonicalTitle.split(' ').filter(Boolean));
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.min(left.size, right.size);
}

interface PreparedEntry {
  entry: ImportedEntry;
  title: string;
  tokens: Set<string>;
  artist: string;
  album?: string;
  duration?: number;
}

interface PreparedCandidate {
  candidate: MatchCandidate;
  title: string;
  tokens: Set<string>;
  artist: string;
  mainArtist: string;
  album: string;
  duration: number;
}

function prepareEntry(entry: ImportedEntry): PreparedEntry {
  const title = tidy(cleanTitle(entry.title ?? ''));
  return {
    entry,
    title,
    tokens: tokens(title),
    artist: tidy(mainArtist(entry.artist ?? '')),
    ...(entry.album ? { album: entry.album } : {}),
    ...(typeof entry.duration === 'number' && entry.duration > 0
      ? { duration: entry.duration }
      : {}),
  };
}

function prepareCandidate(candidate: MatchCandidate): PreparedCandidate {
  const title = tidy(cleanTitle(candidate.title ?? ''));
  return {
    candidate,
    title,
    tokens: tokens(title),
    artist: tidy(candidate.artist ?? ''),
    mainArtist: tidy(mainArtist(candidate.artist ?? '')),
    album: candidate.album ?? '',
    duration: candidate.duration,
  };
}

export interface ScoreBreakdown {
  score: number;
}

/** Scores one prepared pair. Exported for verification tests only. */
function scorePrepared(
  entry: PreparedEntry,
  candidate: PreparedCandidate,
  settings: Required<Omit<MatchOptions, 'exhaustive'>>,
): ScoreBreakdown {
  if (!entry.title || !candidate.title) return { score: 0 };

  const rawEntryArtist = entry.entry.artist ?? '';
  const artistsAgree =
    artistMatch(rawEntryArtist, candidate.candidate.artist ?? '') ||
    (entry.artist !== '' && entry.artist === candidate.mainArtist);
  const artistOverlap = overlap(
    tokens(entry.artist || tidy(rawEntryArtist)),
    tokens(candidate.artist || candidate.mainArtist),
  );

  const durationsKnown =
    typeof entry.duration === 'number' &&
    entry.duration > 0 &&
    Number.isFinite(candidate.duration) &&
    candidate.duration > 0;
  const durationDelta = durationsKnown
    ? Math.abs((entry.duration as number) - candidate.duration)
    : Number.POSITIVE_INFINITY;
  const durationOk = !durationsKnown || durationDelta <= settings.durationTolerance;
  // A large duration difference means a different edit, even with the same name.
  if (durationsKnown && durationDelta > settings.durationTolerance * 4) return { score: 0 };

  let score: number;
  if (entry.title === candidate.title && artistsAgree && durationOk) {
    score = 1;
  } else if (
    entry.title === candidate.title &&
    (artistsAgree || artistOverlap >= 0.5) &&
    durationOk
  ) {
    score = 0.9;
  } else if (entry.title === candidate.title && artistOverlap > 0) {
    score = 0.7;
  } else {
    const titleOverlap = overlap(entry.tokens, candidate.tokens);
    if (titleOverlap >= 0.9 && artistsAgree && durationOk) {
      score = 0.86;
    } else if (titleOverlap >= 0.66 && artistOverlap >= 0.5 && durationOk) {
      score = 0.68;
    } else if (titleOverlap >= 0.5 && artistsAgree && durationOk) {
      score = 0.58;
    } else {
      score = 0;
    }
  }
  if (score === 0) return { score: 0 };

  // Album agreement is corroborating evidence; disagreement alone is not proof
  // (compilations and single releases legitimately differ).
  if (entry.album && candidate.album && searchText(entry.album) === searchText(candidate.album))
    score = Math.min(1, score + 0.04);
  if (durationsKnown) {
    if (durationDelta <= 2) score = Math.min(1, score + 0.05);
    else if (durationDelta > settings.durationTolerance) score = Math.max(0, score - 0.15);
  }
  return { score: Number(score.toFixed(3)) };
}

export function scoreCandidate(
  entry: ImportedEntry,
  candidate: MatchCandidate,
  options: MatchOptions = {},
): ScoreBreakdown {
  return scorePrepared(prepareEntry(entry), prepareCandidate(candidate), {
    ...DEFAULT_MATCH_OPTIONS,
    ...options,
  });
}

export interface MatchIndex {
  /** Canonical title token → candidate positions. */
  byToken: Map<string, number[]>;
  candidates: PreparedCandidate[];
}

/** Inverted index: only candidates sharing a title token can ever score above 0. */
export function buildMatchIndex(candidates: MatchCandidate[]): MatchIndex {
  const prepared = candidates.slice(0, MAX_IMPORT_ENTRIES * 20).map(prepareCandidate);
  const byToken = new Map<string, number[]>();
  prepared.forEach((candidate, index) => {
    for (const token of candidate.tokens) {
      const bucket = byToken.get(token);
      if (bucket) bucket.push(index);
      else byToken.set(token, [index]);
    }
  });
  return { byToken, candidates: prepared };
}

function candidatePositions(
  entry: PreparedEntry,
  index: MatchIndex,
  exhaustive: boolean,
): number[] {
  if (exhaustive) return index.candidates.map((_, position) => position);
  const seen = new Set<number>();
  const positions: number[] = [];
  for (const token of entry.tokens) {
    for (const position of index.byToken.get(token) ?? []) {
      if (seen.has(position)) continue;
      seen.add(position);
      positions.push(position);
    }
  }
  // Deterministic order regardless of token iteration order in the map.
  return positions.sort((a, b) => a - b);
}

/**
 * Assigns each entry to at most one local track, preferring the globally
 * strongest pairs first so a distinctive match cannot be stolen by an earlier
 * generic one. Deterministic for identical inputs.
 */
export function matchEntries(
  entries: ImportedEntry[],
  candidates: MatchCandidate[],
  options: MatchOptions = {},
): ImportReport {
  if (entries.length > MAX_IMPORT_ENTRIES)
    throw new Error(`A playlist cannot have more than ${MAX_IMPORT_ENTRIES} songs.`);
  const settings = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const preparedEntries = entries.map(prepareEntry);
  const index = buildMatchIndex(candidates);
  const pairs: {
    entryIndex: number;
    position: number;
    candidate: MatchCandidate;
    score: number;
  }[] = [];

  preparedEntries.forEach((entry, entryIndex) => {
    if (!entry.title) return;
    for (const position of candidatePositions(entry, index, options.exhaustive === true)) {
      const candidate = index.candidates[position];
      const { score } = scorePrepared(entry, candidate, settings);
      if (score >= settings.reportScore)
        pairs.push({ entryIndex, position, candidate: candidate.candidate, score });
    }
  });

  pairs.sort((a, b) => b.score - a.score || a.entryIndex - b.entryIndex || a.position - b.position);

  const takenTracks = new Set<string>();
  const chosen = new Map<number, { candidate: MatchCandidate; score: number }>();
  for (const pair of pairs) {
    if (chosen.has(pair.entryIndex) || takenTracks.has(pair.candidate.id)) continue;
    chosen.set(pair.entryIndex, { candidate: pair.candidate, score: pair.score });
    takenTracks.add(pair.candidate.id);
  }

  const matches = entries.map((entry, entryIndex): EntryMatch => {
    const best = chosen.get(entryIndex);
    const alternatives = pairs
      .filter((pair) => pair.entryIndex === entryIndex && pair.candidate.id !== best?.candidate.id)
      .map((pair) => ({ trackId: pair.candidate.id, score: pair.score }))
      .slice(0, 3);
    if (!best) return { entry, status: 'missing', score: 0, alternatives };
    // Two local songs scoring the same is a real ambiguity (single vs compilation),
    // never a silent pick.
    const tied = alternatives.some((alternative) => alternative.score >= best.score);
    const accepted = best.score >= settings.acceptScore && !tied;
    return {
      entry,
      status: accepted ? 'matched' : 'ambiguous',
      trackId: best.candidate.id,
      score: best.score,
      alternatives,
    };
  });

  const trackIds = [
    ...new Set(
      matches
        .filter((match) => match.status === 'matched' && match.trackId)
        .map((match) => match.trackId as string),
    ),
  ];

  return {
    matches,
    matchedCount: matches.filter((match) => match.status === 'matched').length,
    ambiguousCount: matches.filter((match) => match.status === 'ambiguous').length,
    missingCount: matches.filter((match) => match.status === 'missing').length,
    trackIds,
  };
}

/** Accepts a user's manual choice for an ambiguous or missing entry. */
export function chooseCandidate(
  report: ImportReport,
  entryIndex: number,
  trackId: string,
): ImportReport {
  if (!report.matches[entryIndex]) throw new Error('Unknown playlist entry.');
  if (typeof trackId !== 'string' || !trackId) throw new Error('Invalid song choice.');
  const matches = report.matches.map((match, index) => {
    if (index !== entryIndex) {
      return match.trackId === trackId && match.status === 'matched'
        ? { ...match, status: 'ambiguous' as MatchStatus, trackId: undefined, score: 0 }
        : match;
    }
    return { ...match, status: 'matched' as MatchStatus, trackId, score: 1 };
  });
  const accepted = matches.filter((match) => match.status === 'matched' && match.trackId);
  return {
    matches,
    matchedCount: accepted.length,
    ambiguousCount: matches.filter((match) => match.status === 'ambiguous').length,
    missingCount: matches.filter((match) => match.status === 'missing').length,
    trackIds: [...new Set(accepted.map((match) => match.trackId as string))],
  };
}

/** Playlist name suggested by the provider, trimmed to the domain limit. */
export function suggestedPlaylistName(raw: string | undefined, provider: string): string {
  const name = raw?.replace(/\s+/gu, ' ').trim();
  return (name && name.slice(0, 120)) || `Imported ${provider} playlist`;
}
