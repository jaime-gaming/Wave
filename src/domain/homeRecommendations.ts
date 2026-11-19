import type { TrackAnalysis } from '../audio/dsp';
import type { Track } from './types';
import type { ListeningSummary } from './listening';
import { canonical, mainArtist } from './lyricsMatch';
import { analyzeSongMood, inferListeningMood, moodSimilarity, type ListeningSignal } from './mood';

/**
 * Local-only, deterministic daily discovery shaped automatically by the
 * listener's current musical mood, balancing affinity, mood flow and variety.
 */
export function homeRecommendations(
  tracks: Track[],
  listening?: ListeningSummary,
  day = new Date().toLocaleDateString(),
  current?: Track,
  analysisLookup?: (track: Track) => TrackAnalysis | undefined,
  moodSignals?: ListeningSignal[],
): Track[] {
  const plays = new Map(listening?.topTracks.map((item) => [item.track.id, item.plays]));
  const artists = new Map(
    listening?.topArtists.map((item) => [canonical(mainArtist(item.artist)), item.plays]),
  );
  const recentIds = listening?.recentTracks.map((track) => track.id) ?? [];
  const justHeard = new Set(recentIds.slice(0, 3));

  // Automatically infer the user's current listening mood from dwell-weighted
  // listening signals, active track and recent session.
  const derivedSignals: ListeningSignal[] | undefined =
    moodSignals && moodSignals.length > 0
      ? moodSignals
      : listening?.recent?.length
        ? [...listening.recent].reverse().map((item) => ({
            trackId: item.trackId,
            seconds: item.seconds,
            duration: item.track.duration,
            completed: item.completed,
            at: item.at,
          }))
        : undefined;
  const sessionMood = inferListeningMood(
    tracks,
    [...recentIds].reverse(),
    current,
    analysisLookup,
    derivedSignals,
  );

  const jitter = (id: string) => {
    let hash = 2166136261;
    for (const c of `${day}:${id}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return (hash >>> 0) / 4294967295;
  };
  const score = (track: Track) => {
    let moodBoost = 0;
    if (sessionMood && sessionMood.confidence >= 0.25) {
      const trackMood = analyzeSongMood(track, analysisLookup?.(track));
      const sim = moodSimilarity(trackMood.vector, sessionMood.vector);
      // Reward mood alignment strongly without locking out discovery.
      moodBoost = (sim - 0.5) * 4.2 * (0.4 + 0.6 * trackMood.confidence);
    }
    return (
      (track.favorite ? 2 : 0) +
      Math.log1p(artists.get(canonical(mainArtist(track.artist))) ?? 0) +
      ((plays.get(track.id) ?? 0) === 0 ? 1.5 : 0.5) +
      moodBoost +
      jitter(track.id) * 2 -
      (justHeard.has(track.id) ? 4 : 0)
    );
  };
  const pool = [...tracks].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const chosen: Track[] = [];
  const artistCounts = new Map<string, number>();
  const uniqueArtists = new Set(tracks.map((t) => canonical(mainArtist(t.artist))).filter(Boolean));
  const maxPerArtist = uniqueArtists.size >= 4 ? 2 : uniqueArtists.size >= 2 ? 4 : 12;

  while (pool.length && chosen.length < 12) {
    const recentWindow = chosen.slice(-2).map((t) => canonical(mainArtist(t.artist)));
    // Prefer an artist not in the last 2 picks and below per-artist cap.
    let index = pool.findIndex((track) => {
      const key = canonical(mainArtist(track.artist));
      return !recentWindow.includes(key) && (artistCounts.get(key) ?? 0) < maxPerArtist;
    });
    if (index < 0) {
      const previous = canonical(mainArtist(chosen.at(-1)?.artist ?? ''));
      index = pool.findIndex((track) => canonical(mainArtist(track.artist)) !== previous);
    }
    const [picked] = pool.splice(index < 0 ? 0 : index, 1);
    const key = canonical(mainArtist(picked.artist));
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    chosen.push(picked);
  }
  return chosen;
}
