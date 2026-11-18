import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useT } from '../i18n';

const LINE = 'M4 15C7 15 9 15 12 15C15 15 17 15 20 15C23 15 25 15 28 15C31 15 33 15 36 15';
const WAVE = 'M4 15C7 15 9 25 12 25C15 25 17 5 20 5C23 5 25 25 28 25C31 25 33 15 36 15';
const W = 'M4 7C7 7 7 23 12 23C17 23 17 7 20 7C23 7 23 23 28 23C33 23 33 7 36 7';

export function StartupAnimation({ loading }: { loading: boolean }) {
  const t = useT();
  const animation = useWaveMotion();
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setComplete(true), animation.enabled ? 1900 : 250);
    return () => clearTimeout(timer);
  }, [animation.enabled]);
  return (
    <AnimatePresence>
      {(loading || !complete) && (
        <motion.div
          className="boot-screen"
          role="progressbar"
          aria-label={t('Loading Wave')}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={animation.effects}
        >
          <div className="boot-wordmark" aria-hidden="true">
            <svg viewBox="0 0 40 32" fill="none">
              <motion.path
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={animation.enabled ? { d: [LINE, WAVE, LINE, W] } : { d: W }}
                transition={{
                  duration: animation.enabled ? 1.25 : 0,
                  times: [0, 0.3, 0.55, 1],
                  ease: 'easeInOut',
                }}
              />
            </svg>
            <motion.span
              initial={animation.enabled ? { opacity: 0, width: 0, x: -10 } : false}
              animate={{ opacity: 1, width: 'auto', x: 0 }}
              transition={{
                duration: animation.enabled ? 0.4 : 0,
                delay: animation.enabled ? 1.15 : 0,
              }}
            >
              ave
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
