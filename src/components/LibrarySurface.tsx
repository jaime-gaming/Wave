import type { ReactNode } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

export function LibrarySurface({ children }: { children: ReactNode }) {
  const animation = useWaveMotion();
  const present = useIsPresent();
  return (
    <motion.section
      className="library-surface"
      aria-label="Music library"
      inert={!present}
      aria-hidden={!present}
      initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 16 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: animation.enabled ? -8 : 0, transition: animation.effects }}
      transition={{ ...animation.spatial, opacity: animation.effects }}
    >
      {children}
    </motion.section>
  );
}
