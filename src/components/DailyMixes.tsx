import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { dailyMixes, localDayKey, type DailyMix, type FeatureMap } from '../domain/dailyMixes';
import { cachedAnalysis, primeAnalysis } from '../audio/mixAnalysis';
import { playlistIcon } from '../domain/playlistVisual';
import type { Track } from '../domain/types';
import { Artwork } from './Artwork';
export function DailyMixes({
  tracks,
  onOpen,
}: {
  tracks: Track[];
  onOpen: (mix: DailyMix, number: number) => void;
}) {
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
    return dailyMixes(tracks, day, features);
  }, [tracks, day]);
  // Analysing the songs a mix would use makes the next visit already ordered.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const track of tracks.slice(0, 24)) if (track.blob) primeAnalysis(track.blob);
    }, 1200);
    return () => clearTimeout(timer);
  }, [tracks]);
  if (!mixes.length) return null;
  return (
    <section className="daily-mixes" aria-label="Daily mixes">
      <div className="section-heading">
        <h2>Daily mixes</h2>
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
            whileHover={animation.enabled ? { y: -3 } : undefined}
            whileTap={animation.enabled ? { scale: 0.99 } : undefined}
            aria-label={`Open Daily mix ${index + 1}: ${mix.label}`}
            onClick={() => onOpen(mix, index + 1)}
          >
            <Artwork
              track={{
                title: mix.label,
                album: '',
                artwork:
                  mix.tracks.find((t) => t.artwork)?.artwork ?? playlistIcon(mix.id, mix.label),
              }}
            />
            <span className="daily-mix-copy">
              <strong>Daily mix {index + 1}</strong>
              <span title={mix.label}>{mix.label}</span>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
}
