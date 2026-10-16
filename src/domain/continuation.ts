import { canonical, mainArtist } from './lyricsMatch';
import { missingTag } from './metadata';
import type { Track } from './types';
/** Local musical context plus weighted variety; no listening profile leaves the device. */
export function continuationQueue(
  tracks: Track[],
  current: Track,
  recent: string[],
  random = Math.random,
  limit = 12,
): string[] {
  const candidates = tracks.filter((t) => t.id !== current.id),
    fresh = candidates.filter((t) => !recent.slice(-12).includes(t.id));
  const pool = [...(fresh.length ? fresh : candidates)].sort(
    (a, b) => recent.lastIndexOf(a.id) - recent.lastIndexOf(b.id),
  );
  const result: string[] = [];
  let anchor = current;
  while (pool.length && result.length < limit) {
    const weighted = pool.map((t) => {
      const sameArtist =
        canonical(mainArtist(t.artist)) === canonical(mainArtist(anchor.artist)) &&
        !missingTag(t.artist);
      const sameAlbum =
        !missingTag(t.album) && canonical(t.album) === canonical(anchor.album) && sameArtist;
      const shared =
        t.genres?.some((g) => anchor.genres?.some((a) => canonical(a) === canonical(g))) ?? false;
      const decade =
        t.year && anchor.year && Math.floor(t.year / 10) === Math.floor(anchor.year / 10);
      const duration =
        t.duration > 0 && anchor.duration > 0
          ? Math.min(t.duration, anchor.duration) / Math.max(t.duration, anchor.duration)
          : 0;
      return {
        track: t,
        weight:
          1 +
          (sameArtist ? 4 : 0) +
          (sameAlbum ? 3 : 0) +
          (shared ? 4 : 0) +
          (decade ? 1 : 0) +
          duration +
          (t.favorite ? 0.5 : 0),
      };
    });
    let ticket =
      Math.max(0, Math.min(0.999999, random())) * weighted.reduce((sum, t) => sum + t.weight, 0);
    const selected = weighted.find((t) => (ticket -= t.weight) < 0)?.track ?? pool[0];
    result.push(selected.id);
    pool.splice(pool.indexOf(selected), 1);
    anchor = selected;
  }
  return result;
}
