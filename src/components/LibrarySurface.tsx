import type { ReactNode } from 'react';
import { motion, useIsPresent, usePresenceData } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

import { useT } from '../i18n';
export function LibrarySurface({ children }: { children: ReactNode }) {
  const t = useT();
  const animation = useWaveMotion();
  const present = useIsPresent();
  const direction = (usePresenceData() as number | undefined) ?? 1;
  return (
    <motion.section
      className="library-surface"
      aria-label={t('Music library')}
      inert={!present}
      aria-hidden={!present}
      initial={animation.enabled ? { opacity: 0, x: 18 * direction } : false}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: animation.enabled ? -12 * direction : 0,
        transition: animation.effects,
      }}
      transition={{ ...animation.lateral, opacity: animation.effects }}
    >
      {children}
    </motion.section>
  );
}
