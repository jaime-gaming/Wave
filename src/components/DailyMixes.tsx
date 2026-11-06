import type { ListeningSummary } from '../domain/listening';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from './Glyphs';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { dailyMixes, localDayKey, type DailyMix, type FeatureMap } from '../domain/dailyMixes';
import { cachedAnalysis, analyzeTrack } from '../audio/mixAnalysis';
import type { Track } from '../domain/types';
import { Artwork } from './Artwork';
import { useT } from '../i18n';
export function DailyMixes({
  tracks,
  listening,
  onOpen,
}: {
  tracks: Track[];
  listening?: ListeningSummary;
  onOpen: (mix: DailyMix, number: number) => void;
}) {
  const t = useT();
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [day, setDay] = useState(localDayKey);
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
  /**
   * Tempo and energy come from the Mix analysis that already runs in a worker.
   * Until a song has been measured the mix simply keeps its tag-based order, so
   * nothing waits on analysis to appear.
   */
  const mixes = useMemo(() => {
    const features: FeatureMap = {};
    for (const track of tracks) {
      const analysis = track.blob ? cachedAnalysis(track.blob) : undefined;
      if (!analysis) continue;
      features[track.id] = {
        bpm: analysis.beats.bpm,
        energy: analysis.peak > 0 ? Math.min(1, analysis.peak) : undefined,
      };
    }
    return dailyMixes(
      tracks,
      day,
      features,
      listening?.topArtists.map((artist) => artist.artist),
    );
    // Cache writes are external to React; the revision publishes newly measured features.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, day, analysisRevision, listening]);
  // Analysing the songs a mix would use makes the next visit already ordered.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Sequential decoding bounds peak memory; publish the new ordering once.
      for (const track of tracks.slice(0, 24)) {
        if (cancelled) return;
        if (track.blob) await analyzeTrack(track.blob);
      }
      if (!cancelled) setAnalysisRevision((value) => value + 1);
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tracks]);
  if (!mixes.length) return null;
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
              {mix.tracks.slice(0, 3).map((track) => (
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
}
