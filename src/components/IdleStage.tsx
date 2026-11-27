import { AnimatePresence, motion } from 'motion/react';
import { MixVisual } from './MixVisual';
import { MixCueLabel, MixCueVisual } from './MixCueVisual';
import { Artwork } from './Artwork';
import { LyricsPanel } from './LyricsPanel';
import { useT } from '../i18n';
import { formatTime, type Track } from '../domain/types';
import { useWaveMotion } from '../ui/motion';
import type { usePlayer } from '../hooks/usePlayer';
import type { MixCue } from '../ui/mixCue';

export interface IdleStageProps {
  track: Track;
  time: number;
  duration: number;
  hasVideo: boolean;
  mixing: boolean;
  blend?: ReturnType<typeof usePlayer>['blend'];
  pending?: MixCue | null;
  mixCue?: MixCue | null;
  animation: ReturnType<typeof useWaveMotion>;
  readTime?: () => number;
  playing: boolean;
  onSeek: (seconds: number) => void;
  onEditLyrics: () => void;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function IdleStage({
  track,
  time,
  duration,
  hasVideo,
  mixing,
  blend,
  pending,
  mixCue,
  animation,
  readTime,
  playing,
  onSeek,
  onEditLyrics,
}: IdleStageProps) {
  const t = useT();
  const hasLyrics = !!track.lyrics?.lines.length;
  const progress = duration > 0 ? clamp01(time / duration) : 0;
  const remaining = Math.max(0, duration - time);
  const label = t('Now playing');

  return (
    <motion.div
      key="immersive"
      className={`immersive-stage idle-stage-v3${hasVideo ? ' with-video' : ''}${hasLyrics ? ' has-lyrics' : ' without-lyrics'}${mixing ? ' is-mixing' : ''}`}
      aria-label={t('Immersive listening')}
      initial={animation.enabled ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: animation.enabled ? -8 : 0, transition: animation.effects }}
      transition={animation.reveal}
    >
      {}
      <div className="idle-room" aria-hidden="true">
        <span className="idle-room__glow" />
        <span className="idle-room__orbit" />
      </div>

      <div className="immersive-art idle-art">
        <div className="immersive-cover immersive-cover-frame idle-sleeve">
          {blend ? (
            <MixVisual blend={blend} artworkClassName="immersive-cover-art" />
          ) : pending ? (
            <MixCueVisual cue={pending} artworkClassName="immersive-cover-art" />
          ) : (
            <Artwork track={track} className="immersive-cover-art" />
          )}
        </div>

        <div className="immersive-credit idle-credit">
          <p className="idle-eyebrow">{label}</p>
          <h2>{track.title}</h2>
          <p className="idle-artist">{track.artist}</p>
          {!!track.album && <p className="idle-album">{track.album}</p>}

          <AnimatePresence initial={false}>
            {mixCue && (
              <motion.div
                className="immersive-mix-cue idle-mix-cue"
                key="immersive-mix-cue"
                initial={animation.enabled ? { opacity: 0, height: 0, y: 4 } : false}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={animation.enabled ? { opacity: 0, height: 0, y: -2 } : undefined}
                transition={animation.effects}
              >
                <MixCueLabel cue={mixCue} />
              </motion.div>
            )}
          </AnimatePresence>

          <p className="immersive-time idle-time">
            {formatTime(time)} <span aria-hidden="true">/</span> {formatTime(duration)}
            {duration > 0 && <span className="idle-time__remaining">−{formatTime(remaining)}</span>}
          </p>
        </div>
      </div>

      {hasLyrics && (
        <LyricsPanel
          stage
          cinematic
          track={track}
          time={time}
          readTime={readTime}
          playing={playing}
          duration={duration}
          onSeek={onSeek}
          onEdit={onEditLyrics}
        />
      )}

      <div className="immersive-progress idle-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
        <i className="idle-progress__head" style={{ left: `${progress * 100}%` }} />
      </div>
    </motion.div>
  );
}
