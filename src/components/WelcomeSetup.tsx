import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '../i18n';
import { useWaveMotion } from '../ui/motion';
import { MaterialSwitch } from './MaterialSwitch';
import { WaveWordmark } from './WaveWordmark';
import { WelcomePreview } from './WelcomePreview';
import type { Track } from '../domain/types';

type Theme = 'dark' | 'light' | 'system';
type Progress = { done: number; total: number; added?: number; fileName?: string } | null;
export function WelcomeSetup({
  animations,
  onAnimations,
  largeText,
  onLargeText,
  theme,
  onTheme,
  name,
  onName,
  automaticLyrics,
  onAutomaticLyrics,
  wordSources,
  onWordSources,
  volumeFix,
  onVolumeFix,
  mixEnabled,
  onMixEnabled,
  progress,
  tracks = [],
  error,
  message,
  onAdd,
  onFinish,
}: {
  animations: boolean;
  onAnimations: (value: boolean) => void;
  largeText: boolean;
  onLargeText: (value: boolean) => void;
  theme: Theme;
  onTheme: (value: Theme) => void;
  name: string;
  onName: (value: string) => void;
  automaticLyrics: boolean;
  onAutomaticLyrics: (value: boolean) => void;
  wordSources: boolean;
  onWordSources: (value: boolean) => void;
  volumeFix: boolean;
  onVolumeFix: (value: boolean) => void;
  mixEnabled: boolean;
  onMixEnabled: (value: boolean) => void;
  progress: Progress;
  tracks?: Track[];
  error: string;
  message: string;
  onAdd: () => void;
  onFinish: () => void;
}) {
  const { t, choice, setChoice } = useI18n();
  const animation = useWaveMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const focusHeading = useCallback(
    (node: HTMLHeadingElement | null) => {
      if (node && step > 0) node.focus({ preventScroll: true });
    },
    [step],
  );
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const titles = [
    'Welcome to Wave',
    'What should we call you?',
    'Make it yours',
    'Your sound',
    'Find lyrics',
    'Follow every word',
    'Ready to listen',
  ];
  const loading = !!progress;
  const hasMusic = tracks.length > 0;
  return (
    <dialog
      ref={dialog}
      className="welcome-screen"
      aria-labelledby="welcome-title"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (
          event.key !== 'Enter' ||
          event.repeat ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          loading
        )
          return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest('button, select, textarea, a, [role="switch"]')
        )
          return;
        event.preventDefault();
        if (step < titles.length - 1) go(step + 1);
        else onFinish();
      }}
    >
      <motion.section
        className="welcome-setup"
        initial={animation.enabled ? { opacity: 0, y: 15 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={animation.reveal}
      >
        <div className="welcome-glow" aria-hidden="true" />
        <div className="welcome-visual" aria-hidden="true">
          <motion.div
            className="welcome-orbit welcome-orbit-outer"
            animate={animation.enabled ? { rotate: step * 32, scale: 1 } : { rotate: 0, scale: 1 }}
            transition={animation.cinematic}
          />
          <motion.div
            className="welcome-orbit welcome-orbit-inner"
            animate={
              animation.enabled
                ? { rotate: -step * 45, scale: step % 2 ? 0.9 : 1 }
                : { rotate: 0, scale: 1 }
            }
            transition={animation.cinematic}
          />
          <WelcomePreview
            step={step}
            name={name}
            theme={theme}
            largeText={largeText}
            volumeFix={volumeFix}
            mixEnabled={mixEnabled}
            automaticLyrics={automaticLyrics}
            wordSources={wordSources}
            tracks={tracks}
          />
        </div>
        <div className="welcome-content">
          <WaveWordmark />
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            {loading ? (
              <motion.div
                key="loading"
                className="welcome-step welcome-import"
                initial={animation.enabled ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={animation.effects}
              >
                <h2 id="welcome-title">{t('Bringing your music in')}</h2>
                <p>{t('This can take a little while. Your original files stay where they are.')}</p>
                <div className="welcome-import-card">
                  <div className="welcome-import-symbol" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <progress
                    max={Math.max(1, progress.total)}
                    value={Math.min(progress.done, Math.max(1, progress.total))}
                    aria-label={t('Adding music')}
                  />
                </div>
                <p role="status">
                  {t('{done} of {total} files', { done: progress.done, total: progress.total })}
                </p>
                {progress.fileName && (
                  <p className="welcome-import-filename">{progress.fileName}</p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key={step}
                className="welcome-step"
                custom={direction}
                variants={{
                  enter: (d: number) => ({ opacity: 0, y: animation.enabled ? d * 14 : 0 }),
                  center: { opacity: 1, y: 0 },
                  exit: (d: number) => ({ opacity: 0, y: animation.enabled ? d * -8 : 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={
                  animation.enabled ? { duration: 0.24, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }
                }
              >
                <div className="welcome-progress-header">
                  <span>{t('Getting started')}</span>
                  <span>
                    {t('Step {current} of {total}', { current: step + 1, total: titles.length })}
                  </span>
                </div>
                <div
                  className="welcome-progress"
                  role="progressbar"
                  aria-label={t('Setup progress')}
                  aria-valuemin={1}
                  aria-valuemax={titles.length}
                  aria-valuenow={step + 1}
                  aria-valuetext={t('Step {current} of {total}', {
                    current: step + 1,
                    total: titles.length,
                  })}
                >
                  {titles.map((title, index) => (
                    <span key={title} className={index <= step ? 'is-current' : ''} />
                  ))}
                </div>
                <h2 id="welcome-title" tabIndex={-1} ref={focusHeading}>
                  {t(titles[step])}
                </h2>
                {step === 0 && (
                  <>
                    <p>{t('Your music, your space. Let’s set it up together.')}</p>
                    <p className="welcome-hint">
                      {t(
                        'Your music stays on this device. You can skip setup or change these choices later.',
                      )}
                    </p>
                  </>
                )}
                {step === 1 && (
                  <>
                    <p>
                      {t('Optional. Your name stays on this device and you can change it later.')}
                    </p>
                    <label className="welcome-name">
                      <span>{t('Your name')}</span>
                      <input
                        value={name}
                        maxLength={40}
                        autoComplete="off"
                        onChange={(event) => onName(event.target.value)}
                        placeholder={t('Your name')}
                      />
                    </label>
                  </>
                )}
                {step === 2 && (
                  <>
                    <p>{t('Choose what feels right. You can change this later in Settings.')}</p>
                    <div className="welcome-options">
                      <label className="welcome-row">
                        <span>{t('Language')}</span>
                        <select
                          value={choice}
                          onChange={(event) =>
                            setChoice(event.target.value as 'system' | 'en' | 'es')
                          }
                        >
                          <option value="system">{t('System')}</option>
                          <option value="en">English</option>
                          <option value="es">Español</option>
                        </select>
                      </label>
                      <label className="welcome-row">
                        <span>{t('Theme')}</span>
                        <select
                          value={theme}
                          onChange={(event) => onTheme(event.target.value as Theme)}
                        >
                          <option value="system">{t('System')}</option>
                          <option value="dark">{t('Dark')}</option>
                          <option value="light">{t('Light')}</option>
                        </select>
                      </label>
                      <div className="welcome-row">
                        <span>{t('Larger text')}</span>
                        <MaterialSwitch
                          label={t('Larger text')}
                          checked={largeText}
                          onChange={onLargeText}
                        />
                      </div>
                      <div className="welcome-row">
                        <span>{t('Animations')}</span>
                        <MaterialSwitch
                          label={t('Animations')}
                          checked={animations}
                          onChange={onAnimations}
                        />
                      </div>
                    </div>
                  </>
                )}
                {step === 3 && (
                  <>
                    <p>{t('Make songs sound more even when you listen.')}</p>
                    <div className="welcome-options">
                      <div className="welcome-row">
                        <span>
                          {t('Mix')}
                          <small>{t('Blend songs smoothly during playback.')}</small>
                        </span>
                        <MaterialSwitch
                          label={t('Mix')}
                          checked={mixEnabled}
                          onChange={onMixEnabled}
                        />
                      </div>
                      <div className="welcome-row">
                        <span>
                          {t('Fix volume')}
                          <small>{t('Balance loudness without changing your files.')}</small>
                        </span>
                        <MaterialSwitch
                          label={t('Fix volume')}
                          checked={volumeFix}
                          onChange={onVolumeFix}
                        />
                      </div>
                    </div>
                  </>
                )}
                {step === 4 && (
                  <>
                    <p>
                      {t(
                        'Song titles and artists are sent to a lyrics service. Your audio stays here.',
                      )}
                    </p>
                    <div className="welcome-row">
                      <span>{t('Find lyrics automatically')}</span>
                      <MaterialSwitch
                        label={t('Find lyrics automatically')}
                        checked={automaticLyrics}
                        onChange={onAutomaticLyrics}
                      />
                    </div>
                  </>
                )}
                {step === 5 && (
                  <>
                    <p>
                      {t(
                        'Also search other services for lyrics that follow each word. Song titles and artists are shared with them.',
                      )}
                    </p>
                    <div className="welcome-row">
                      <span>{t('Try more lyrics sources')}</span>
                      <MaterialSwitch
                        label={t('Try more lyrics sources')}
                        checked={wordSources}
                        onChange={onWordSources}
                      />
                    </div>
                  </>
                )}
                {step === 6 && (
                  <>
                    <p>
                      {t(
                        hasMusic
                          ? 'Finished adding music. You can add more or start listening.'
                          : 'Add your music now, or take a look around first.',
                      )}
                    </p>
                    <div className="welcome-summary" aria-label={t('Your choices')}>
                      <span>
                        {t('Mix')}: {t(mixEnabled ? 'On' : 'Off')}
                      </span>
                      <span>
                        {t('Fix volume')}: {t(volumeFix ? 'On' : 'Off')}
                      </span>
                      <span>
                        {t('Find lyrics automatically')}: {t(automaticLyrics ? 'On' : 'Off')}
                      </span>
                      <span>
                        {t('Try more lyrics sources')}: {t(wordSources ? 'On' : 'Off')}
                      </span>
                    </div>
                    <p className="welcome-summary-note">
                      {t('You can change these choices anytime in Settings.')}
                    </p>
                    {message && <p role="status">{t(message)}</p>}
                    {error && <p role="alert">{t(error)}</p>}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {!loading && (
            <div className="welcome-actions">
              {step > 0 && (
                <button className="text-button" type="button" onClick={() => go(step - 1)}>
                  {t('Back')}
                </button>
              )}
              {step < titles.length - 1 ? (
                <button className="filled-button" type="button" onClick={() => go(step + 1)}>
                  {t(step === 0 ? 'Get started' : 'Continue')}
                </button>
              ) : (
                <button
                  className={hasMusic ? 'tonal-button' : 'filled-button'}
                  type="button"
                  onClick={onAdd}
                >
                  {t(hasMusic ? 'Add more music' : 'Add my music')}
                </button>
              )}
              <button
                className={hasMusic && step === 6 ? 'filled-button' : 'text-button'}
                type="button"
                onClick={onFinish}
              >
                {t('Explore Wave')}
              </button>
            </div>
          )}
        </div>
      </motion.section>
    </dialog>
  );
}
