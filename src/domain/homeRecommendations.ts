import type { Track } from './types';
import type { ListeningSummary } from './listening';
import { canonical, mainArtist } from './lyricsMatch';

/** Local-only, deterministic daily discovery, balancing affinity and variety. */
export function homeRecommendations(
  tracks: Track[],
  listening?: ListeningSummary,
  day = new Date().toLocaleDateString(),
): Track[] {
  const plays = new Map(listening?.topTracks.map((item) => [item.track.id, item.plays]));
  const artists = new Map(
    listening?.topArtists.map((item) => [canonical(mainArtist(item.artist)), item.plays]),
  );
  const justHeard = new Set(listening?.recentTracks.slice(0, 3).map((track) => track.id));
  const jitter = (id: string) => {
    let hash = 2166136261;
    for (const c of `${day}:${id}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return (hash >>> 0) / 4294967295;
  };
  const score = (track: Track) =>
    (track.favorite ? 2 : 0) +
    Math.log1p(artists.get(canonical(mainArtist(track.artist))) ?? 0) +
    ((plays.get(track.id) ?? 0) === 0 ? 1.5 : 0.5) +
    jitter(track.id) * 2 -
    (justHeard.has(track.id) ? 4 : 0);
  const pool = [...tracks].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const chosen: Track[] = [];
  while (pool.length && chosen.length < 12) {
    const previous = canonical(mainArtist(chosen.at(-1)?.artist ?? ''));
    const index = pool.findIndex((track) => canonical(mainArtist(track.artist)) !== previous);
    chosen.push(...pool.splice(index < 0 ? 0 : index, 1));
  }
  return chosen;
}
