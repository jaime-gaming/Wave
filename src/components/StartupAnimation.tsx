import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { useT } from '../i18n';
const W = 'M4 7C7 7 7 23 12 23C17 23 17 7 20 7C23 7 23 23 28 23C33 23 33 7 36 7';
export function StartupAnimation({ loading }: { loading: boolean }) {
  const t = useT();
  const animation = useWaveMotion();
  // The mark introduces Wave; it does not need to be introduced again every time
  // the app is reopened in the same tab.
  const [complete, setComplete] = useState(() => {
    try {
      if (sessionStorage.getItem('wave-booted')) return true;
      sessionStorage.setItem('wave-booted', '1');
      return false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const timer = setTimeout(() => setComplete(true), 1150);
    return () => clearTimeout(timer);
  }, []);
  const visible = loading || (animation.enabled && !complete);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="boot-screen"
          role="progressbar"
          aria-label={t('Loading Wave')}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: animation.enabled ? 1.015 : 1 }}
          transition={animation.effects}
        >
          <div className="boot-wordmark" aria-hidden="true">
            <svg viewBox="0 0 40 32" fill="none">
              <motion.path
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d={W}
                initial={animation.enabled ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: animation.enabled ? 0.65 : 0, ease: 'easeInOut' }}
              />
            </svg>
            <motion.span
              initial={animation.enabled ? { opacity: 0, width: 0, x: -10 } : false}
              animate={{ opacity: 1, width: 'auto', x: 0 }}
              transition={{
                duration: animation.enabled ? 0.35 : 0,
                delay: animation.enabled ? 0.55 : 0,
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
