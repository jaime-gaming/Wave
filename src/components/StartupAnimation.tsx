import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useT } from '../i18n';
import { WaveWordmark } from './WaveWordmark';

export function StartupAnimation({
  loading,
  onFinished,
}: {
  loading: boolean;
  onFinished?: () => void;
}) {
  const t = useT();
  const animation = useWaveMotion();
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setComplete(true), animation.enabled ? 1000 : 250);
    return () => clearTimeout(timer);
  }, [animation.enabled]);
  return (
    <AnimatePresence onExitComplete={onFinished}>
      {(loading || !complete) && (
        <motion.div
          className="boot-screen"
          role="progressbar"
          aria-label={t('Loading Wave')}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={
            animation.enabled ? { opacity: 0, scale: 1.025, filter: 'blur(6px)' } : { opacity: 0 }
          }
          transition={
            animation.enabled ? { duration: 0.28, ease: [0.4, 0, 1, 1] } : animation.effects
          }
        >
          <motion.div
            className="boot-wordmark"
            initial={animation.enabled ? { opacity: 0, scale: 0.92, y: 8 } : false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={
              animation.enabled ? { duration: 0.85, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }
            }
          >
            <WaveWordmark variant="full" />
          </motion.div>
          <div className="boot-indicator" aria-hidden="true">
            <span />
          </div>
          <span className="boot-caption">{t('Loading your music…')}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
