import { AnimatePresence, motion } from 'motion/react';
import { Captions, Check, Heart, Music2, PlayPauseGlyph, SlidersHorizontal } from './Glyphs';
import { WaveWordmark } from './WaveWordmark';
import { useT } from '../i18n';
import { useWaveMotion } from '../ui/motion';
import { Artwork } from './Artwork';
import type { Track } from '../domain/types';

export function WelcomePreview({
  step,
  name,
  theme,
  largeText,
  volumeFix,
  mixEnabled = false,
  automaticLyrics,
  wordSources,
  tracks = [],
}: {
  step: number;
  name: string;
  theme: 'dark' | 'light' | 'system';
  largeText: boolean;
  volumeFix: boolean;
  mixEnabled?: boolean;
  automaticLyrics: boolean;
  wordSources: boolean;
  tracks?: Track[];
}) {
  const t = useT();
  const animation = useWaveMotion();
  const featured = tracks.slice(0, 3);
  const view =
    step < 2
      ? 'home'
      : step === 2
        ? 'appearance'
        : step === 3
          ? 'sound'
          : step < 6
            ? 'lyrics'
            : 'library';
  return (
    <div
      className={`welcome-preview welcome-preview--${theme}${largeText ? ' is-large-text' : ''}`}
    >
      <div className="welcome-preview-chrome">
        <WaveWordmark variant="mark" />
        <span />
        <span />
        <span />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          className="welcome-preview-body"
          initial={animation.enabled ? { opacity: 0, y: 12, scale: 0.97 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={animation.enabled ? { opacity: 0, y: -8, scale: 0.98 } : { opacity: 0 }}
          transition={animation.enabled ? { duration: 0.24 } : { duration: 0 }}
        >
          {view === 'home' && (
            <>
              <p>
                {name.trim()
                  ? t('Your Remix, {name}', { name: name.trim() })
                  : t('Your music, your space.')}
              </p>
              <strong>{t('Made for you')}</strong>
              <div className="welcome-preview-tiles">
                <i />
                <i />
                <i />
              </div>
            </>
          )}
          {view === 'appearance' && (
            <>
              <p>{t('Make it yours')}</p>
              <strong>{t('Appearance')}</strong>
              <div className="welcome-preview-row">
                <span>{t('Theme')}</span>
                <b>{t(theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System')}</b>
              </div>
              <div className="welcome-preview-row">
                <span>{t('Larger text')}</span>
                <i className={largeText ? 'is-on' : ''} />
              </div>
            </>
          )}
          {view === 'sound' && (
            <>
              <p>{t('Your sound')}</p>
              <strong>{t('Fix volume')}</strong>
              <div className="welcome-preview-levels">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="welcome-preview-row">
                <span>{t('Mix')}</span>
                <i className={mixEnabled ? 'is-on' : ''} />
              </div>
              <div className="welcome-preview-row">
                <SlidersHorizontal size={18} />
                <span>{t('Fix volume')}</span>
                <i className={volumeFix ? 'is-on' : ''} />
              </div>
            </>
          )}
          {view === 'lyrics' && (
            <>
              <p>
                <Captions size={16} /> {t('Lyrics')}
              </p>
              <strong>{t('Follow every word')}</strong>
              <div
                className={`welcome-preview-lyrics${automaticLyrics ? ' is-on' : ''}${step === 5 && wordSources ? ' is-expanded' : ''}`}
              >
                <span />
                <span />
                <span />
              </div>
              <div className="welcome-preview-row">
                <span>
                  {t(step === 4 ? 'Find lyrics automatically' : 'Try more lyrics sources')}
                </span>
                <i className={(step === 4 ? automaticLyrics : wordSources) ? 'is-on' : ''} />
              </div>
            </>
          )}
          {view === 'library' && (
            <>
              <p>{t('Your music, your space.')}</p>
              <strong>{t('Library')}</strong>
              <div className="welcome-preview-tiles welcome-preview-library">
                {featured.length ? (
                  featured.map((track) => (
                    <div className="welcome-preview-album" key={track.id}>
                      <Artwork track={track} />
                      <span>{track.title}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <i />
                    <i />
                    <i />
                  </>
                )}
              </div>
              <div className="welcome-preview-row">
                <Music2 size={18} />
                <span>
                  {featured.length ? `${tracks.length} · ${t('Songs')}` : t('Ready to listen')}
                </span>
                <Check size={18} />
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="welcome-preview-player">
        <span className="welcome-preview-cover">
          {tracks[0] && view === 'library' ? <Artwork track={tracks[0]} /> : <Music2 size={20} />}
        </span>
        <span className="welcome-preview-track">
          <b>{tracks[0] && view === 'library' ? tracks[0].title : t('Your music')}</b>
          <small>{tracks[0] && view === 'library' ? tracks[0].artist : t('Wave')}</small>
        </span>
        <Heart size={18} />
        <PlayPauseGlyph playing={false} size={19} />
      </div>
    </div>
  );
}
