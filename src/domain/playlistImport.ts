import { artistMatch, canonical, cleanTitle, mainArtist } from './lyricsMatch';
import { searchText } from './musicIdentity';

/**
 * Matching a pasted playlist against the local collection.
 *
 * The importer only ever produces a *proposal*: every entry is reported as
 * matched, ambiguous or missing, and nothing is written until the user confirms.
 * A local song is never assigned to two entries, and a low-confidence match is
 * surfaced as ambiguous instead of being silently accepted.
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
}

export const DEFAULT_MATCH_OPTIONS: Required<MatchOptions> = {
  durationTolerance: 5,
  acceptScore: 0.82,
  reportScore: 0.45,
};

/** Text decorations that only appear on provider titles. */
function tidy(value: string): string {
  return canonical(
    value
      .replace(
        /\s*[|–—-]\s*[^|–—-]*(?:official|lyrics?|visualizer|audio|video|hd|hq|4k)\s*$/giu,
        ' ',
      )
      .replace(
        /\s*[([]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyric\s+video|visuali[sz]er|hd|hq|4k|explicit)\s*[)\]]\s*/giu,
        ' ',
      )
      .replace(/\s*-\s*topic\s*$/iu, '')
      .replace(/\s*\b(?:official|lyrics?|visuali[sz]er)\b\s*/giu, ' '),
  );
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(' ').filter(Boolean));
  const right = new Set(b.split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.min(left.size, right.size);
}

export interface ScoreBreakdown {
  score: number;
  /** Title and artist already identify the same recording. */
  strong: boolean;
}

export function scoreCandidate(
  entry: ImportedEntry,
  candidate: MatchCandidate,
  options: MatchOptions = {},
): ScoreBreakdown {
  const tolerance = options.durationTolerance ?? DEFAULT_MATCH_OPTIONS.durationTolerance;
  const entryTitle = tidy(cleanTitle(entry.title));
  const candidateTitle = tidy(cleanTitle(candidate.title));
  if (!entryTitle || !candidateTitle) return { score: 0, strong: false };

  const artistsAgree =
    artistMatch(entry.artist || '', candidate.artist || '') ||
    tidy(mainArtist(entry.artist || '')) === tidy(mainArtist(candidate.artist || ''));
  const artistOverlap = tokenOverlap(tidy(entry.artist || ''), tidy(candidate.artist || ''));

  const durationsKnown =
    typeof entry.duration === 'number' &&
    entry.duration > 0 &&
    Number.isFinite(candidate.duration) &&
    candidate.duration > 0;
  const durationDelta = durationsKnown
    ? Math.abs((entry.duration as number) - candidate.duration)
    : Number.POSITIVE_INFINITY;
  const durationOk = !durationsKnown || durationDelta <= tolerance;
  // A large duration difference means a different edit, even with the same name.
  if (durationsKnown && durationDelta > tolerance * 4) return { score: 0, strong: false };

  let score: number;
  let strong = false;
  if (entryTitle === candidateTitle && artistsAgree && durationOk) {
    score = 1;
    strong = true;
  } else if (
    entryTitle === candidateTitle &&
    (artistsAgree || artistOverlap >= 0.5) &&
    durationOk
  ) {
    score = 0.9;
    strong = true;
  } else if (entryTitle === candidateTitle && artistOverlap > 0) {
    score = 0.7;
  } else {
    const overlap = tokenOverlap(entryTitle, candidateTitle);
    if (overlap >= 0.9 && artistsAgree && durationOk) {
      score = 0.86;
      strong = true;
    } else if (overlap >= 0.66 && artistOverlap >= 0.5 && durationOk) {
      score = 0.68;
    } else if (overlap >= 0.5 && artistsAgree && durationOk) {
      score = 0.58;
    } else {
      score = 0;
    }
  }
  if (score === 0) return { score: 0, strong: false };

  // Album agreement is corroborating evidence; disagreement alone is not proof
  // (compilations and single releases legitimately differ).
  if (entry.album && candidate.album && searchText(entry.album) === searchText(candidate.album))
    score = Math.min(1, score + 0.04);
  if (durationsKnown) {
    if (durationDelta <= 2) score = Math.min(1, score + 0.05);
    else if (durationDelta > tolerance) score = Math.max(0, score - 0.15);
  }
  return { score: Number(score.toFixed(3)), strong: strong && durationOk };
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
  const settings = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const pairs: { entryIndex: number; candidate: MatchCandidate; score: number; strong: boolean }[] =
    [];
  entries.forEach((entry, entryIndex) => {
    if (!entry.title?.trim()) return;
    for (const candidate of candidates) {
      const breakdown = scoreCandidate(entry, candidate, settings);
      if (breakdown.score >= settings.reportScore)
        pairs.push({ entryIndex, candidate, score: breakdown.score, strong: breakdown.strong });
    }
  });
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.entryIndex - b.entryIndex ||
      a.candidate.id.localeCompare(b.candidate.id),
  );

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
