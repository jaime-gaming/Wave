import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
const W = 'M4 7C7 7 7 23 12 23C17 23 17 7 20 7C23 7 23 23 28 23C33 23 33 7 36 7';
const LINE = 'M4 16C7 16 7 16 12 16C17 16 17 16 20 16C23 16 23 16 28 16C33 16 33 16 36 16';
const WAVE = 'M4 16C7 16 7 26 12 26C17 26 17 3 20 3C23 3 23 26 28 26C33 26 33 16 36 16';
export function StartupAnimation({ loading }: { loading: boolean }) {
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
          aria-label="Loading Wave"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: animation.enabled ? 1.015 : 1 }}
          transition={animation.effects}
        >
          <svg viewBox="0 0 40 32" fill="none" aria-hidden="true">
            <motion.path
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ d: W }}
              animate={{ d: animation.enabled ? [W, LINE, WAVE, LINE, W] : W }}
              transition={
                animation.enabled
                  ? {
                      duration: 1.15,
                      times: [0, 0.24, 0.5, 0.72, 1],
                      ease: 'easeInOut',
                      repeat: Infinity,
                    }
                  : { duration: 0 }
              }
            />
          </svg>
          <span>Wave</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
