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
  // Twenty-four songs is the memory of what autoplay has just been doing: a
  // library of thirty should not come back to the same three songs all evening.
  const heard = new Set(recent.slice(-24));
  const avoid = new Set(recent.slice(-6));
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(20, Math.floor(limit))) : 12;
  const unique = new Map(tracks.map((track) => [track.id, track]));
  const recentArtists = recent
    .slice(-3)
    .map((id) => unique.get(id))
    .filter((track): track is Track => !!track && !missingTag(track.artist))
    .map((track) => canonical(mainArtist(track.artist)));
  const candidates = [...unique.values()].filter(
      (t) =>
        t.id !== current.id &&
        (t.source === 'youtube' ? /^[\w-]{11}$/.test(t.videoId ?? '') : !!t.blob?.size),
    ),
    fresh = candidates.filter((t) => !heard.has(t.id));
  const pool = [...(fresh.length ? fresh : candidates)].sort(
    (a, b) => recent.lastIndexOf(a.id) - recent.lastIndexOf(b.id),
  );
  const result: string[] = [];
  let anchor = current;
  while (pool.length && result.length < count) {
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
      // The next song of the same album, in order, is what a person would play
      // next after a track that has a next track.
      const nextOnAlbum =
        sameAlbum &&
        !!t.trackNumber &&
        !!anchor.trackNumber &&
        t.trackNumber === anchor.trackNumber + 1;
      // An artist heard a moment ago steps back, so a shuffle does not turn into
      // five songs by the same band in a row.
      const justHeard = avoid.has(t.id) ? 0.2 : 1;
      const artist = canonical(mainArtist(t.artist));
      const variety =
        !nextOnAlbum && !missingTag(t.artist) && recentArtists.includes(artist) ? 0.55 : 1;
      return {
        track: t,
        weight:
          (1 +
            (sameArtist ? 4 : 0) +
            (sameAlbum ? 3 : 0) +
            (nextOnAlbum ? 5 : 0) +
            (shared ? 4 : 0) +
            (decade ? 1 : 0) +
            duration +
            (t.favorite ? 0.5 : 0)) *
          justHeard *
          variety,
      };
    });
    const draw = random();
    let ticket =
      (Number.isFinite(draw) ? Math.max(0, Math.min(0.999999, draw)) : 0.5) *
      weighted.reduce((sum, t) => sum + t.weight, 0);
    const selected = weighted.find((t) => (ticket -= t.weight) < 0)?.track ?? pool[0];
    result.push(selected.id);
    pool.splice(pool.indexOf(selected), 1);
    if (!missingTag(selected.artist)) {
      recentArtists.push(canonical(mainArtist(selected.artist)));
      if (recentArtists.length > 3) recentArtists.shift();
    }
    anchor = selected;
  }
  return result;
}
