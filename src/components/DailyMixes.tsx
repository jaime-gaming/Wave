import type { ListeningSummary } from '../domain/listening';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from './Glyphs';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import {
  dailyMixes,
  localDayKey,
  MIN_DAILY_MIX_TRACKS,
  mixCovers,
  type DailyMix,
  type FeatureMap,
} from '../domain/dailyMixes';
import { cachedAnalysis, analyzeTrack } from '../audio/mixAnalysis';
import type { Track } from '../domain/types';
import { Artwork } from './Artwork';
import { useT } from '../i18n';

/**
 * Completed Daily Mixes cached in memory AND persisted in localStorage per
 * `(day, catalogSignature)` so once today's mixes exist they render instantly
 * on every visit without waiting, flickering, or rotating their cover sleeves.
 */
const completedMixCache = new Map<string, DailyMix[]>();
const MAX_CACHED_SETS = 4;
const STORAGE_KEY = 'wave-daily-mixes-v2';
/** Safety bound so a malformed local file can never hold up Daily Mix delivery. */
const ANALYSIS_DEADLINE_MS = 6_000;

interface StoredMixSnapshot {
  day: string;
  signature: string;
  mixes: Array<{
    id: string;
    label: string;
    basis: DailyMix['basis'];
    descriptor: string;
    trackIds: string[];
    coverIds: string[];
  }>;
}

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

function cacheCompleted(key: string, day: string, mixes: DailyMix[]) {
  if (completedMixCache.size >= MAX_CACHED_SETS && !completedMixCache.has(key)) {
    const oldest = completedMixCache.keys().next().value;
    if (oldest) completedMixCache.delete(oldest);
  }
  completedMixCache.set(key, mixes);
  if (!mixes.length) return;
  try {
    const payload: StoredMixSnapshot = {
      day,
      signature: key,
      mixes: mixes.map((mix) => ({
        id: mix.id,
        label: mix.label,
        basis: mix.basis,
        descriptor: mix.descriptor,
        trackIds: mix.tracks.map((track) => track.id),
        coverIds: mix.covers.map((track) => track.id),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* Private browsing or full storage keeps the in-memory cache working. */
  }
}

/**
 * Synchronously restores today's previously saved Daily Mixes so already-created
 * mixes appear instantaneously without re-analyzing or flashing a skeleton.
 */
function readPersistedMixes(signature: string, day: string, tracks: Track[]): DailyMix[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMixSnapshot;
    if (!parsed || parsed.day !== day || parsed.signature !== signature || !parsed.mixes?.length) {
      return null;
    }
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const hydrated: DailyMix[] = [];
    for (const entry of parsed.mixes) {
      const resolvedTracks = entry.trackIds
        .map((id) => byId.get(id))
        .filter((track): track is Track => Boolean(track));
      if (resolvedTracks.length < MIN_DAILY_MIX_TRACKS) return null;
      const resolvedCovers = entry.coverIds
        .map((id) => byId.get(id))
        .filter((track): track is Track => Boolean(track));
      hydrated.push({
        id: entry.id,
        label: entry.label,
        basis: entry.basis ?? 'genre',
        descriptor: entry.descriptor ?? entry.label,
        tracks: resolvedTracks,
        covers: resolvedCovers.length
          ? resolvedCovers
          : mixCovers(resolvedTracks, entry.id, day, 3),
      });
    }
    if (!hydrated.length) return null;
    completedMixCache.set(signature, hydrated);
    return hydrated;
  } catch {
    return null;
  }
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

  // Synchronously restore already-created mixes for today so they render instantly.
  const persisted = useMemo(() => {
    if (!tracks.length) return null;
    return completedMixCache.get(signature) ?? readPersistedMixes(signature, day, tracks);
  }, [signature, day, tracks]);

  // Check whether today's mixes still require first-time local audio analysis.
  const needsAsyncBuild = useMemo(() => {
    if (loading || busy || tracks.length < MIN_DAILY_MIX_TRACKS) return false;
    if (persisted) return false;
    return (
      pendingAnalysisTracks(tracks, day, listening?.topArtists.map((artist) => artist.artist) ?? [])
        .length > 0
    );
    // Intentionally keyed on structural `signature` and readiness flags, NOT live playback updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loading, busy, persisted]);

  // Finish measuring candidate local songs BEFORE delivering a Daily Mix, then save
  // the finished mixes to localStorage so future visits show them immediately.
  useEffect(() => {
    if (loading || busy || tracksRef.current.length < MIN_DAILY_MIX_TRACKS) return;
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
      cacheCompleted(signature, day, built);
      setReadyKey(signature);
    })();

    return () => {
      cancelled = true;
    };
  }, [signature, day, loading, busy, needsAsyncBuild]);

  const mixes = useMemo(() => {
    if (loading || tracks.length < MIN_DAILY_MIX_TRACKS) return [];
    let resolved = persisted ?? completedMixCache.get(signature);
    if (!resolved) {
      if (busy) return [];
      if (needsAsyncBuild && readyKey !== signature) return [];
      resolved = dailyMixes(
        tracks,
        day,
        collectFeatures(tracks),
        listening?.topArtists.map((artist) => artist.artist) ?? [],
      );
      cacheCompleted(signature, day, resolved);
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
  }, [signature, day, loading, busy, needsAsyncBuild, readyKey, tracks, persisted]);

  const isBuilding =
    !mixes.length &&
    ((busy && tracks.length >= MIN_DAILY_MIX_TRACKS) ||
      (!loading && !busy && needsAsyncBuild && readyKey !== signature));

  if (isBuilding) {
    return (
      <section
        className="daily-mixes daily-mixes--loading"
        aria-label={t('Daily mixes')}
        aria-busy="true"
      >
        <div className="section-heading">
          <h2>{t('Daily mixes')}</h2>
          <p className="daily-mix-status-note">{t('Your daily mix is on its way')}</p>
        </div>
        <div className="daily-mix-grid" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="daily-mix-card daily-mix-skeleton">
              <span className="daily-mix-sleeves">
                <span className="skeleton-box skeleton-sleeve" />
                <span className="skeleton-box skeleton-sleeve" />
                <span className="skeleton-box skeleton-sleeve" />
              </span>
              <span className="daily-mix-copy">
                <span className="skeleton-box skeleton-line skeleton-line--title" />
                <span className="skeleton-box skeleton-line skeleton-line--sub" />
                <span className="skeleton-box skeleton-line skeleton-line--meta" />
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (loading || !mixes.length) return null;
  return (
    <section className="daily-mixes" aria-label={t('Daily mixes')}>
      <div className="section-heading">
        <h2>{t('Daily mixes')}</h2>
        <p>{t('A fresh route through your music, every day')}</p>
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
