import type { TrackAnalysis } from '../audio/dsp';
import { canonical, mainArtist } from './lyricsMatch';
import { missingTag } from './metadata';
import { analyzeSongMood, MOOD_DISPLAY, type MoodLabel } from './mood';
import type { Track } from './types';

/**
 * Daily mixes built from local tags, mood profiles and audio measurements.
 *
 * Designed for genuine daily variety without artist burnout:
 * - Caps how many tracks any single artist can take in a multi-artist mix.
 * - Spaces artists generously across a sliding window instead of back-to-back alternation.
 * - Varies the listening flow day to day (warm-up arc, rising energy, wave contour,
 *   or fresh shuffle) rather than repeating the exact same BPM sort every morning.
 * - Falls back to multi-artist Mood Mixes when tracks have no genre tags, only
 *   building a single-artist mix if the collection itself has just one artist.
 */
export interface MixFeatures {
  /** Measured tempo, when the song has been analysed for Mix. */
  bpm?: number;
  /** 0..1 energy from the same analysis. */
  energy?: number;
  /** Optional full audio analysis for richer mood profiling. */
  analysis?: TrackAnalysis;
}

export type FeatureMap = Record<string, MixFeatures | undefined>;

export const MIN_DAILY_MIX_TRACKS = 7;
export const MAX_DAILY_MIX_TRACKS = 20;
export const MAX_DAILY_MIXES = 3;

export interface DailyMix {
  id: string;
  label: string;
  basis: 'genre' | 'mood' | 'artist';
  tracks: Track[];
  /** Stable cover tracks locked for the day so card sleeves never jump or cycle. */
  covers: Track[];
  /** One line for the card: tempo range, song count and years when known. */
  descriptor: string;
  bpm?: number;
  energy?: number;
}

/**
 * Picks up to `count` stable cover sleeves for a Daily Mix for the given calendar day.
 * Order depends strictly on `(day, mixId, track.id)` and prefers distinct album artwork,
 * so the covers never shift when playback, listening stats, or ordering updates occur.
 */
export function mixCovers(tracks: Track[], mixId: string, day: string, count = 3): Track[] {
  if (tracks.length <= count) return [...tracks];
  const bySeed = [...tracks].sort(
    (a, b) =>
      hash(`${day}:cover:${mixId}:${a.id}`) - hash(`${day}:cover:${mixId}:${b.id}`) ||
      a.id.localeCompare(b.id),
  );
  const picked: Track[] = [];
  const usedIds = new Set<string>();
  const usedArt = new Set<string>();

  for (const track of bySeed) {
    if (picked.length >= count) break;
    if (!track.artwork || usedArt.has(track.artwork)) continue;
    usedArt.add(track.artwork);
    usedIds.add(track.id);
    picked.push(track);
  }
  for (const track of bySeed) {
    if (picked.length >= count) break;
    if (usedIds.has(track.id)) continue;
    usedIds.add(track.id);
    picked.push(track);
  }
  return picked;
}

export function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Deterministic shuffle so a mix looks the same all day and changes tomorrow. */
function seededOrder<T>(items: T[], seed: number): T[] {
  const order = [...items];
  let state = seed || 1;
  for (let i = order.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const artistKeyOf = (track: Track) => {
  const main = canonical(mainArtist(track.artist));
  return main || canonical(track.artist);
};

/**
 * Selects up to `maxTracks` songs while capping any single artist so a prolific
 * artist cannot take over the whole mix and burn the listener out.
 */
function balanceArtists(items: Track[], maxTracks = 20): Track[] {
  const distinctArtists = new Set(items.map(artistKeyOf).filter(Boolean));
  if (distinctArtists.size <= 1) return items.slice(0, maxTracks);

  // Soft cap: at most 3 songs per artist when 7+ artists exist, scaling gently
  // for smaller artist pools so we still reach a rich mix without artist fatigue.
  const softCap =
    distinctArtists.size >= 7 ? 3 : Math.max(2, Math.ceil(maxTracks / distinctArtists.size) + 1);

  const counts = new Map<string, number>();
  const primary: Track[] = [];
  const overflow: Track[] = [];
  for (const track of items) {
    const key = artistKeyOf(track);
    const seen = counts.get(key) ?? 0;
    if (!key || seen < softCap) {
      counts.set(key, seen + 1);
      primary.push(track);
    } else {
      overflow.push(track);
    }
  }
  if (primary.length >= maxTracks) return primary.slice(0, maxTracks);
  // Only top up from overflow if the library genuinely has fewer distinct-artist
  // tracks than the mix size, still respecting a strict ceiling when possible.
  const needed = Math.min(maxTracks, items.length) - primary.length;
  return [...primary, ...overflow.slice(0, Math.max(0, needed))];
}

/**
 * Arranges tracks to maximize spacing between repeats of the same artist
 * (a sliding 4-track cooldown window instead of merely avoiding adjacent duplicates).
 */
function spreadArtistsWide(items: Track[]): Track[] {
  const remaining = [...items];
  const result: Track[] = [];
  while (remaining.length) {
    const recent = result.slice(-4).map(artistKeyOf);
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const key = artistKeyOf(remaining[i]);
      const lastPos = key ? recent.lastIndexOf(key) : -1;
      // Not in recent window gets full distance bonus; otherwise further back is better.
      const spacing = lastPos < 0 ? 5 : recent.length - 1 - lastPos;
      // Preserve intended flow order as tie-breaker so the mix contour stays intact.
      const orderBias = -i * 0.015;
      const score = spacing + orderBias;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    result.push(...remaining.splice(bestIndex, 1));
  }
  return result;
}

/**
 * Applies a day-varied listening contour when tempo/energy measurements exist,
 * so the sequence feels crafted rather than identical every day.
 */
function shapeDailyFlow(
  items: Track[],
  daySeed: number,
  bpmOf: (track: Track) => number | undefined,
  energyOf: (track: Track) => number,
): Track[] {
  const byIntensity = [...items].sort(
    (a, b) => (bpmOf(a) ?? 0) - (bpmOf(b) ?? 0) || energyOf(a) - energyOf(b),
  );
  const mode = daySeed % 4;
  if (mode === 0) {
    // Rising build (classic warm-up into peak).
    return byIntensity;
  }
  if (mode === 1) {
    // Peak-to-chill wind-down (opens bright, lands mellow).
    return [...byIntensity].reverse();
  }
  if (mode === 2) {
    // Arch contour: mid → build → peak in the second half → smooth landing.
    const left: Track[] = [];
    const right: Track[] = [];
    byIntensity.forEach((track, idx) => {
      if (idx % 2 === 0) left.push(track);
      else right.unshift(track);
    });
    return [...left, ...right];
  }
  // Undulating wave: alternating lifts and breathers seeded per day.
  const low = byIntensity.slice(0, Math.ceil(byIntensity.length / 2));
  const high = byIntensity.slice(Math.ceil(byIntensity.length / 2));
  const mixedLow = seededOrder(low, daySeed ^ 0x9e3779b9);
  const mixedHigh = seededOrder(high, daySeed ^ 0x85ebca6b);
  const wave: Track[] = [];
  const len = Math.max(mixedLow.length, mixedHigh.length);
  for (let i = 0; i < len; i++) {
    if (i < mixedHigh.length) wave.push(mixedHigh[i]);
    if (i < mixedLow.length) wave.push(mixedLow[i]);
  }
  return wave;
}

export function mixDescriptor(mix: { tracks: Track[]; bpm?: number }): string {
  const parts: string[] = [];
  if (mix.bpm) parts.push(`about ${Math.round(mix.bpm)} BPM`);
  const years = mix.tracks
    .map((track) => track.year)
    .filter((year): year is number => typeof year === 'number' && year > 1000);
  if (years.length >= 2) {
    const low = Math.min(...years),
      high = Math.max(...years);
    parts.push(low === high ? `${low}` : `${low}–${high}`);
  }
  parts.push(`${mix.tracks.length} songs`);
  return parts.join(' · ');
}

export function dailyMixes(
  tracks: Track[],
  day: string,
  features: FeatureMap = {},
  favouriteArtists: string[] = [],
): DailyMix[] {
  const groups = new Map<string, DailyMix>();
  const seen = new Set<string>();
  const untagged: Track[] = [];

  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    const genre = track.genres
      ?.map((g) => g.trim())
      .find(
        (g) =>
          g &&
          canonical(g) &&
          !missingTag(g) &&
          !/^(other|misc(?:ellaneous)?|general|genre)$/i.test(g),
      );
    if (genre) {
      const key = `genre:${canonical(genre)}`;
      const group = groups.get(key) ?? {
        id: key,
        label: genre,
        basis: 'genre',
        tracks: [],
        covers: [],
        descriptor: '',
      };
      group.tracks.push(track);
      groups.set(key, group);
    } else {
      untagged.push(track);
    }
  }

  // Handle tracks without genre tags:
  // If multiple valid artists exist among untagged tracks, cluster by musical mood
  // so listeners get varied multi-artist mixes instead of single-artist burnout.
  // Only fall back to single-artist grouping when there is genuinely one artist.
  const validUntagged = untagged.filter((track) => {
    const artist = mainArtist(track.artist).trim();
    return artist && !missingTag(artist) && !!canonical(artist);
  });
  const untaggedArtists = new Set(validUntagged.map(artistKeyOf).filter(Boolean));

  if (untaggedArtists.size >= 2 && validUntagged.length >= MIN_DAILY_MIX_TRACKS) {
    const moodBuckets = new Map<MoodLabel, Track[]>();
    for (const track of validUntagged) {
      const mood = analyzeSongMood(track, features[track.id]?.analysis);
      const bucket = moodBuckets.get(mood.primary) ?? [];
      bucket.push(track);
      moodBuckets.set(mood.primary, bucket);
    }
    for (const [mood, list] of moodBuckets) {
      if (list.length < MIN_DAILY_MIX_TRACKS) continue;
      const key = `mood:${mood}`;
      groups.set(key, {
        id: key,
        label: MOOD_DISPLAY[mood],
        basis: 'mood',
        tracks: list,
        covers: [],
        descriptor: '',
      });
    }
    // If tracks spread across moods so no single mood hits the minimum yet,
    // combine the untagged pool into one complete multi-artist Daily Mix.
    const hasMoodGroup = [...groups.values()].some((g) => g.basis === 'mood');
    if (!hasMoodGroup && validUntagged.length >= MIN_DAILY_MIX_TRACKS) {
      groups.set('mood:discovery', {
        id: 'mood:discovery',
        label: 'Daily Mix',
        basis: 'mood',
        tracks: validUntagged,
        covers: [],
        descriptor: '',
      });
    }
  } else {
    for (const track of validUntagged) {
      const artist = mainArtist(track.artist).trim();
      const key = `artist:${canonical(artist)}`;
      const group = groups.get(key) ?? {
        id: key,
        label: artist,
        basis: 'artist',
        tracks: [],
        covers: [],
        descriptor: '',
      };
      group.tracks.push(track);
      groups.set(key, group);
    }
  }

  const eligible = [...groups.values()].filter(
    (group) => group.tracks.length >= MIN_DAILY_MIX_TRACKS,
  );
  const basisRank = (basis: DailyMix['basis']) =>
    basis === 'genre' ? 2 : basis === 'mood' ? 1 : 0;
  const hasFav = (group: DailyMix) =>
    group.tracks.some((track) =>
      favouriteArtists.some(
        (artist) => canonical(mainArtist(artist)) === canonical(mainArtist(track.artist)),
      ),
    );
  const artistDiversity = (group: DailyMix) =>
    new Set(group.tracks.map(artistKeyOf).filter(Boolean)).size;

  const ranked = eligible.sort(
    (a, b) =>
      Number(hasFav(b)) - Number(hasFav(a)) ||
      basisRank(b.basis) - basisRank(a.basis) ||
      artistDiversity(b) - artistDiversity(a) ||
      b.tracks.length - a.tracks.length ||
      a.id.localeCompare(b.id),
  );

  // Rotate slightly among extra eligible groups across days so a large library
  // doesn't show the exact same 3 genres every single day of the year.
  const selected =
    ranked.length > MAX_DAILY_MIXES
      ? [
          ranked[0],
          ...seededOrder(ranked.slice(1), hash(`picks:${day}`)).slice(0, MAX_DAILY_MIXES - 1),
        ]
      : ranked.slice(0, MAX_DAILY_MIXES);

  return selected.map((group) => {
    const bpmOf = (track: Track) => features[track.id]?.bpm;
    const energyOf = (track: Track) => features[track.id]?.energy ?? 0;
    const measured = group.tracks.filter((track) => (bpmOf(track) ?? 0) > 0).length;
    const sorted = [...group.tracks].sort((a, b) => a.id.localeCompare(b.id));
    const seed = hash(`${day}:${group.id}`);
    const shuffled = seededOrder(sorted, seed);

    // Cap per-artist concentration BEFORE flow shaping so no artist hijacks the mix.
    let ordered = balanceArtists(shuffled, MAX_DAILY_MIX_TRACKS);

    if (measured >= Math.ceil(group.tracks.length / 2)) {
      ordered = shapeDailyFlow(ordered, seed, bpmOf, energyOf);
    }
    ordered = spreadArtistsWide(ordered).slice(0, MAX_DAILY_MIX_TRACKS);

    const enoughMeasured = measured >= Math.ceil(ordered.length / 2);
    const bpms = enoughMeasured
      ? ordered.map(bpmOf).filter((value): value is number => !!value)
      : [];
    const energies = ordered.map(energyOf).filter((value) => value > 0);
    const bpm = bpms.length ? bpms.reduce((sum, value) => sum + value, 0) / bpms.length : undefined;
    const energy = energies.length
      ? energies.reduce((sum, value) => sum + value, 0) / energies.length
      : undefined;
    return {
      ...group,
      tracks: ordered,
      covers: mixCovers(ordered, group.id, day, 3),
      bpm,
      energy,
      descriptor: mixDescriptor({ tracks: ordered, bpm }),
    };
  });
}
