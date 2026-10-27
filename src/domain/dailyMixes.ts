import { canonical, mainArtist } from './lyricsMatch';
import { missingTag } from './metadata';
import type { Track } from './types';

/**
 * Daily mixes from local tags and local audio measurements.
 *
 * Songs are grouped by their first useful genre tag, or by main artist when a
 * song has no genre. Inside a group the order is built for listening rather
 * than for shuffling: tempo and energy rise together when Wave has measured
 * them, and the same artist never plays twice in a row.
 *
 * Nothing leaves the device and no mood is invented: a mix says which tag it
 * came from, how many songs it holds and, when available, its tempo range.
 */
export interface MixFeatures {
  /** Measured tempo, when the song has been analysed for Mix. */
  bpm?: number;
  /** 0..1 energy from the same analysis. */
  energy?: number;
}

export type FeatureMap = Record<string, MixFeatures | undefined>;

export interface DailyMix {
  id: string;
  label: string;
  basis: 'genre' | 'artist';
  tracks: Track[];
  /** One line for the card: tempo range, song count and years when known. */
  descriptor: string;
  bpm?: number;
  energy?: number;
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

/**
 * Keeps the order but moves a song later whenever it would repeat the previous
 * artist. Deterministic: after the first pass the rest is appended in order.
 */
function spreadArtists<T extends { artist: string }>(items: T[]): T[] {
  const remaining = [...items];
  const result: T[] = [];
  while (remaining.length) {
    const last = result.at(-1)?.artist;
    const index = remaining.findIndex((item) => item.artist !== last);
    result.push(...remaining.splice(index < 0 ? 0 : index, 1));
  }
  return result;
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

export function dailyMixes(tracks: Track[], day: string, features: FeatureMap = {}): DailyMix[] {
  const groups = new Map<string, DailyMix>();
  const seen = new Set<string>();
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
    const artist = mainArtist(track.artist).trim();
    const label = genre ?? (!missingTag(artist) ? artist : '');
    if (!label || !canonical(label)) continue;
    const basis = genre ? 'genre' : 'artist';
    const key = `${basis}:${canonical(label)}`;
    const group = groups.get(key) ?? { id: key, label, basis, tracks: [], descriptor: '' };
    group.tracks.push(track);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.tracks.length >= 3)
    .sort(
      (a, b) =>
        Number(b.basis === 'genre') - Number(a.basis === 'genre') ||
        b.tracks.length - a.tracks.length ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 4)
    .map((group) => {
      const bpmOf = (track: Track) => features[track.id]?.bpm;
      const energyOf = (track: Track) => features[track.id]?.energy ?? 0;
      const measured = group.tracks.filter((track) => (bpmOf(track) ?? 0) > 0).length;
      const sorted = [...group.tracks].sort((a, b) => a.id.localeCompare(b.id));
      let ordered = seededOrder(sorted, hash(`${day}:${group.id}`));

      if (measured >= Math.ceil(group.tracks.length / 2)) {
        // Build up instead of jumping around: slowest first, energy as tie-breaker.
        ordered = [...ordered].sort(
          (a, b) => (bpmOf(a) ?? 0) - (bpmOf(b) ?? 0) || energyOf(a) - energyOf(b),
        );
      }
      ordered = spreadArtists(ordered).slice(0, 40);

      const enoughMeasured = measured >= Math.ceil(ordered.length / 2);
      const bpms = enoughMeasured
        ? ordered.map(bpmOf).filter((value): value is number => !!value)
        : [];
      const energies = ordered.map(energyOf).filter((value) => value > 0);
      const bpm = bpms.length
        ? bpms.reduce((sum, value) => sum + value, 0) / bpms.length
        : undefined;
      const energy = energies.length
        ? energies.reduce((sum, value) => sum + value, 0) / energies.length
        : undefined;
      return {
        ...group,
        tracks: ordered,
        bpm,
        energy,
        descriptor: mixDescriptor({ tracks: ordered, bpm }),
      };
    });
}
