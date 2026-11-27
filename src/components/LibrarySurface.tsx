import type { ReactNode } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

import { useT } from '../i18n';
export function LibrarySurface({ children }: { children: ReactNode; home?: boolean }) {
  const t = useT();
  const animation = useWaveMotion();
  const present = useIsPresent();
  return (
    <motion.section
      className="library-surface"
      aria-label={t('Music library')}
      inert={!present}
      aria-hidden={!present}
      initial={animation.enabled ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: animation.enabled ? 4 : 0,
        transition: { duration: animation.enabled ? 0.1 : 0 },
      }}
      transition={{ duration: animation.enabled ? 0.24 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}
