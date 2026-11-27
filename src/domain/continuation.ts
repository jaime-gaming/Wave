import type { TrackAnalysis } from '../audio/dsp';
import { canonical, mainArtist } from './lyricsMatch';
import { missingTag } from './metadata';
import { transitionCompatibility } from './mixPlanner';
import { analyzeSongMood, inferListeningMood, moodSimilarity, type ListeningSignal } from './mood';
import type { Track } from './types';

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
  const history = recent.slice(-32);
  const heard = new Set(history);
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
  // Once every playable track has been heard, recycle the oldest first instead of
  // immediately drawing again from the whole library. Keep at least one option.
  const oldest = [...candidates].sort(
    (a, b) => history.lastIndexOf(a.id) - history.lastIndexOf(b.id),
  );
  const pool = fresh.length ? [...fresh] : oldest;
  const recycling = fresh.length === 0;

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
    const choices = recycling ? pool.slice(0, Math.max(1, Math.ceil(pool.length / 2))) : pool;
    const weighted = choices.map((t) => {
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

      const nextOnAlbum =
        sameAlbum &&
        !!t.trackNumber &&
        !!anchor.trackNumber &&
        t.trackNumber === anchor.trackNumber + 1;

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

      const whiplashPenalty =
        combinedMood < 0.45 && candidateMood.confidence >= 0.45 && anchorMood.confidence >= 0.45
          ? 0.35
          : 1;

      const anchorAnalysis = analysisLookup?.(anchor);
      const candidateAnalysis = analysisLookup?.(t);
      const mixFit =
        anchorAnalysis && candidateAnalysis
          ? transitionCompatibility(anchorAnalysis, candidateAnalysis)
          : 0.55;
      const mixBoost = mixFit > 0.62 ? (mixFit - 0.62) * 8.5 : 0;
      const mixClashDamp =
        anchorAnalysis?.key && candidateAnalysis?.key && mixFit < 0.38 ? 0.65 : 1;

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
            mixBoost +
            (decade ? 1 : 0) +
            duration +
            (t.favorite ? 0.5 : 0)) *
          justHeard *
          variety *
          whiplashPenalty *
          mixClashDamp,
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
