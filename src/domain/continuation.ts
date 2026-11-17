import type { TrackAnalysis } from '../audio/dsp';
import { canonical, mainArtist } from './lyricsMatch';
import { missingTag } from './metadata';
import { analyzeSongMood, inferListeningMood, moodSimilarity, type ListeningSignal } from './mood';
import type { Track } from './types';

/**
 * Local musical context + dwell-weighted automatic listening mood + weighted variety.
 * Also skips YouTube songs automatically when offline so local playback never stalls.
 */
export function continuationQueue(
  tracks: Track[],
  current: Track,
  recent: string[],
  random = Math.random,
  limit = 12,
  analysisLookup?: (track: Track) => TrackAnalysis | undefined,
  moodSignals?: ListeningSignal[],
  online = true,
): string[] {
  // Twenty-four songs is the memory of what autoplay has just been doing: a
  // library of thirty should not come back to the same three songs all evening.
  const heard = new Set(recent.slice(-24));
  const avoid = new Set(recent.slice(-6));
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(20, Math.floor(limit))) : 12;
  const unique = new Map(tracks.map((track) => [track.id, track]));
  const recentArtists = recent
    .slice(-4)
    .map((id) => unique.get(id))
    .filter((track): track is Track => !!track && !missingTag(track.artist))
    .map((track) => canonical(mainArtist(track.artist)));
  const candidates = [...unique.values()].filter(
      (t) =>
        t.id !== current.id &&
        (t.source === 'youtube' ? online && /^[\w-]{11}$/.test(t.videoId ?? '') : !!t.blob?.size),
    ),
    fresh = candidates.filter((t) => !heard.has(t.id));
  const pool = [...(fresh.length ? fresh : candidates)].sort(
    (a, b) => recent.lastIndexOf(a.id) - recent.lastIndexOf(b.id),
  );

  // Infer the listener's automatic current mood from dwell-weighted signals and session.
  const sessionMood = inferListeningMood(tracks, recent, current, analysisLookup, moodSignals);
  const moodCache = new Map<string, ReturnType<typeof analyzeSongMood>>();
  const moodOf = (track: Track) => {
    let cached = moodCache.get(track.id);
    if (!cached) {
      cached = analyzeSongMood(track, analysisLookup?.(track));
      moodCache.set(track.id, cached);
    }
    return cached;
  };

  const result: string[] = [];
  let anchor = current;
  while (pool.length && result.length < count) {
    const anchorMood = moodOf(anchor);
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

      // Mood affinity: blend similarity to the listener's session mood and to the
      // track just finishing so Autoplay flows seamlessly through the current vibe.
      const candidateMood = moodOf(t);
      const anchorSim = moodSimilarity(candidateMood.vector, anchorMood.vector);
      const sessionSim = sessionMood
        ? moodSimilarity(candidateMood.vector, sessionMood.vector)
        : anchorSim;
      const combinedMood = sessionSim * 0.65 + anchorSim * 0.35;
      const moodWeight = Math.max(0, combinedMood - 0.35) * 6.5;
      const themeMatch = candidateMood.themes.some((theme) => anchorMood.themes.includes(theme))
        ? 1.5
        : 0;
      // Gently dampen jarring mood whiplash when both tracks have confident mood profiles.
      const whiplashPenalty =
        combinedMood < 0.45 && candidateMood.confidence >= 0.45 && anchorMood.confidence >= 0.45
          ? 0.35
          : 1;

      // An artist heard a moment ago steps back, so a shuffle does not turn into
      // five songs by the same band in a row.
      const justHeard = avoid.has(t.id) ? 0.2 : 1;
      const artist = canonical(mainArtist(t.artist));
      const artistIndex = recentArtists.lastIndexOf(artist);
      const variety =
        !nextOnAlbum && !missingTag(t.artist) && artistIndex >= 0
          ? artistIndex === recentArtists.length - 1
            ? 0.35
            : 0.6
          : 1;
      return {
        track: t,
        weight:
          (1 +
            (sameArtist ? 3.2 : 0) +
            (sameAlbum ? 2.5 : 0) +
            (nextOnAlbum ? 6 : 0) +
            (shared ? 3.5 : 0) +
            moodWeight +
            themeMatch +
            (decade ? 1 : 0) +
            duration +
            (t.favorite ? 0.5 : 0)) *
          justHeard *
          variety *
          whiplashPenalty,
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
      if (recentArtists.length > 4) recentArtists.shift();
    }
    anchor = selected;
  }
  return result;
}
