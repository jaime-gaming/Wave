import { canonical, mainArtist } from './lyricsMatch';
import { missingTag } from './metadata';
import type { Track } from './types';
export interface DailyMix {
  id: string;
  label: string;
  basis: 'genre' | 'artist';
  tracks: Track[];
}
export function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Disjoint tagged groups, not inferred audio styles or a remote recommendation profile. */
export function dailyMixes(tracks: Track[], day: string): DailyMix[] {
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
    const group = groups.get(key) ?? { id: key, label, basis, tracks: [] };
    group.tracks.push(track);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.tracks.length >= 3)
    .sort(
      (a, b) =>
        Number(b.basis === 'genre') - Number(a.basis === 'genre') ||
        b.tracks.length - a.tracks.length ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
    .map((group) => {
      const ordered = [...group.tracks].sort((a, b) => a.id.localeCompare(b.id));
      // Cycle the first song daily and seed the remaining order. Stable within a local day.
      const epoch = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000) || 0;
      const first = (((epoch + hash(group.id)) % ordered.length) + ordered.length) % ordered.length;
      const anchor = ordered.splice(first, 1)[0];
      let seed = hash(`${day}:${group.id}`);
      for (let i = ordered.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
      return { ...group, tracks: [anchor, ...ordered].slice(0, 30) };
    });
}
