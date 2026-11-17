import type { ListeningSummary } from '../domain/listening';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from './Glyphs';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import {
  dailyMixes,
  localDayKey,
  mixCovers,
  type DailyMix,
  type FeatureMap,
} from '../domain/dailyMixes';
import { cachedAnalysis, analyzeTrack } from '../audio/mixAnalysis';
import type { Track } from '../domain/types';
import { Artwork } from './Artwork';
import { useT } from '../i18n';

/**
 * Completed Daily Mixes cached per `(day, catalogSignature)` so navigating away
 * from Home, toggling favorites, fetching lyrics, or playing music never resets
 * or flickers the day's mixes or their cover sleeves.
 */
const completedMixCache = new Map<string, DailyMix[]>();
const MAX_CACHED_SETS = 4;
/** Safety bound so a malformed local file can never hold up Daily Mix delivery. */
const ANALYSIS_DEADLINE_MS = 6_000;

function collectFeatures(tracks: Track[]): FeatureMap {
  const features: FeatureMap = {};
  for (const track of tracks) {
    const analysis = track.blob ? cachedAnalysis(track.blob) : undefined;
    if (!analysis) continue;
    features[track.id] = {
      bpm: analysis.beats.bpm,
      energy: analysis.peak > 0 ? Math.min(1, analysis.peak) : undefined,
      analysis,
    };
  }
  return features;
}

function catalogSignature(tracks: Track[], day: string): string {
  const entries = tracks
    .map((track) => `${track.id}\u0000${track.artist}\u0000${track.genres?.join(',') ?? ''}`)
    .sort();
  return `${day}::${entries.join('\u0001')}`;
}

function cacheCompleted(key: string, mixes: DailyMix[]) {
  if (completedMixCache.size >= MAX_CACHED_SETS && !completedMixCache.has(key)) {
    const oldest = completedMixCache.keys().next().value;
    if (oldest) completedMixCache.delete(oldest);
  }
  completedMixCache.set(key, mixes);
}

/**
 * Returns local tracks belonging to today's candidate mixes that still need audio
 * analysis before the finished mixes can be delivered.
 */
function pendingAnalysisTracks(tracks: Track[], day: string, favouriteArtists: string[]): Track[] {
  if (typeof OfflineAudioContext === 'undefined') return [];
  const preview = dailyMixes(tracks, day, collectFeatures(tracks), favouriteArtists);
  const needed: Track[] = [];
  const seen = new Set<string>();
  for (const mix of preview) {
    for (const track of mix.tracks) {
      if (seen.has(track.id) || !track.blob || cachedAnalysis(track.blob)) continue;
      seen.add(track.id);
      needed.push(track);
      if (needed.length >= 24) return needed;
    }
  }
  return needed;
}

export const DailyMixes = memo(function DailyMixes({
  tracks,
  listening,
  loading = false,
  busy = false,
  onOpen,
}: {
  tracks: Track[];
  listening?: ListeningSummary;
  loading?: boolean;
  busy?: boolean;
  onOpen: (mix: DailyMix, number: number) => void;
}) {
  const t = useT();
  const [day, setDay] = useState(localDayKey);
  const [readyKey, setReadyKey] = useState('');
  const animation = useWaveMotion();

  useEffect(() => {
    const refresh = () => setDay(localDayKey());
    const now = new Date();
    const timer = setTimeout(
      refresh,
      Math.max(
        1000,
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime(),
      ),
    );
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [day]);

  const signature = useMemo(() => catalogSignature(tracks, day), [tracks, day]);
  const tracksRef = useRef(tracks);
  const favRef = useRef<string[]>([]);
  useEffect(() => {
    tracksRef.current = tracks;
    favRef.current = listening?.topArtists.map((artist) => artist.artist) ?? [];
  });

  // Check whether today's mixes are already complete (cached or requiring no local decoding).
  const needsAsyncBuild = useMemo(() => {
    if (loading || busy || !tracks.length) return false;
    if (completedMixCache.has(signature)) return false;
    return (
      pendingAnalysisTracks(tracks, day, listening?.topArtists.map((artist) => artist.artist) ?? [])
        .length > 0
    );
    // Intentionally keyed on structural `signature` and readiness flags, NOT live playback updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loading, busy]);

  // Finish measuring candidate local songs BEFORE delivering a Daily Mix, so the
  // user only ever receives complete mixes whose covers and track order stay steady.
  useEffect(() => {
    if (loading || busy || !tracksRef.current.length) return;
    if (completedMixCache.has(signature)) return;
    if (!needsAsyncBuild) return;

    let cancelled = false;
    const snapshotTracks = tracksRef.current;
    const snapshotFavs = favRef.current;

    void (async () => {
      const pending = pendingAnalysisTracks(snapshotTracks, day, snapshotFavs);
      const deadline = Date.now() + ANALYSIS_DEADLINE_MS;
      for (const track of pending) {
        if (cancelled || Date.now() >= deadline) break;
        if (track.blob) {
          try {
            await analyzeTrack(track.blob);
          } catch {
            // Skip unreadable files so they never block delivery.
          }
        }
      }
      if (cancelled) return;
      const built = dailyMixes(snapshotTracks, day, collectFeatures(snapshotTracks), snapshotFavs);
      cacheCompleted(signature, built);
      setReadyKey(signature);
    })();

    return () => {
      cancelled = true;
    };
  }, [signature, day, loading, busy, needsAsyncBuild]);

  const mixes = useMemo(() => {
    if (loading || busy || !tracks.length) return [];
    let resolved = completedMixCache.get(signature);
    if (!resolved) {
      if (needsAsyncBuild && readyKey !== signature) return [];
      resolved = dailyMixes(
        tracks,
        day,
        collectFeatures(tracks),
        listening?.topArtists.map((artist) => artist.artist) ?? [],
      );
      cacheCompleted(signature, resolved);
    }
    // Hydrate latest track objects (e.g. if title/artwork edited) while keeping
    // the exact same locked track order and locked cover trio for the whole day.
    const byId = new Map(tracks.map((track) => [track.id, track]));
    return resolved.map((mix) => {
      const hydratedTracks = mix.tracks.map((track) => byId.get(track.id) ?? track);
      const lockedCovers = (
        mix.covers.length ? mix.covers : mixCovers(hydratedTracks, mix.id, day, 3)
      ).map((track) => byId.get(track.id) ?? track);
      return {
        ...mix,
        tracks: hydratedTracks,
        covers: lockedCovers,
      };
    });
    // `readyKey` publishes when the one-time async build completes; live listening
    // changes intentionally do not reshuffle already-delivered Daily Mixes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, day, loading, busy, needsAsyncBuild, readyKey, tracks]);

  if (loading || busy || !mixes.length) return null;
  return (
    <section className="daily-mixes" aria-label={t('Daily mixes')}>
      <div className="section-heading">
        <h2>{t('Daily mixes')}</h2>
        <p>A fresh route through your music, every day</p>
      </div>
      <motion.div
        className="daily-mix-grid"
        variants={animation.stagger}
        initial="hidden"
        animate="visible"
      >
        {mixes.map((mix, index) => (
          <motion.button
            key={mix.id}
            className="daily-mix-card"
            variants={animation.rise}
            transition={animation.expressive}
            whileHover={animation.hoverEnabled ? { y: -2 } : undefined}
            whileTap={animation.enabled ? { scale: 0.99 } : undefined}
            aria-label={`Open Daily mix ${index + 1}: ${mix.label}`}
            onClick={() => onOpen(mix, index + 1)}
          >
            <span className="daily-mix-sleeves" aria-hidden="true">
              {mix.covers.slice(0, 3).map((track) => (
                <Artwork key={track.id} track={track} />
              ))}
            </span>
            <span className="daily-mix-copy">
              <strong>Daily mix {index + 1}</strong>
              <span title={mix.label}>{mix.label}</span>
              <small>{mix.tracks.length} songs · Made for today</small>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
});
