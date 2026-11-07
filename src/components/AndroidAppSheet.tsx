import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Download, Smartphone, X } from './Glyphs';
import { useWaveMotion } from '../ui/motion';
import { ANDROID_APP_URL } from '../ui/androidApp';

import { useT } from '../i18n';
/**
 * Legacy standalone download sheet. The main web app no longer mounts it or prompts on Home.
 *
 * It is a small sheet above the player, not a modal: the song keeps playing and
 * nothing is blocked. Either answer is remembered, so the question is asked
 * once; the same sheet can still be opened from Settings, deliberately.
 */
export function AndroidAppSheet({
  onDismiss,
  onKeepWeb,
}: {
  onDismiss: () => void;
  /** Remembered as "keep using the web" so the sheet stops appearing. */
  onKeepWeb: () => void;
}) {
  const t = useT();
  const sheet = useRef<HTMLDivElement>(null);
  const animation = useWaveMotion();

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <motion.div
      ref={sheet}
      className="android-app-sheet"
      role="dialog"
      aria-labelledby="android-app-title"
      aria-describedby="android-app-copy"
      initial={animation.enabled ? { opacity: 0, y: 18 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={animation.enabled ? { opacity: 0, y: 12 } : undefined}
      transition={animation.effects}
    >
      <button
        type="button"
        className="icon-button android-app-close"
        aria-label={t('Close')}
        onClick={onDismiss}
      >
        <X size={18} />
      </button>
      <span className="android-app-mark" aria-hidden="true">
        <Smartphone size={18} />
      </span>
      <div className="android-app-text">
        <strong id="android-app-title">{t('Wave for Android')}</strong>
        <p id="android-app-copy">
          {t(
            'Play your local music with lock-screen controls, a home-screen widget and quick settings. Download the Android APK from Releases.',
          )}
        </p>
      </div>
      <div className="android-app-actions">
        <a
          className="tonal-button"
          href={ANDROID_APP_URL}
          target="_blank"
          rel="noreferrer"
          onClick={onDismiss}
        >
          <Download size={16} aria-hidden="true" />
          Download the app
        </a>
        <button type="button" className="text-button" onClick={onKeepWeb}>
          Keep using the web
        </button>
      </div>
    </motion.div>
  );
}
