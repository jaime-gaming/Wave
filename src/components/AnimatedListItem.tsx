import type { ReactNode } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

export function AnimatedListItem({
  className,
  children,
  onClick,
  trackId,
  animateLayout = true,
  index = 0,
}: {
  trackId?: string;
  animateLayout?: boolean;
  index?: number;
  onClick?: import('react').MouseEventHandler<HTMLLIElement>;
  className: string;
  children: ReactNode;
}) {
  const animation = useWaveMotion();
  const present = useIsPresent();
  if (!animateLayout)
    return (
      <li
        data-track-id={trackId}
        className={className}
        onClick={onClick}
        inert={!present}
        aria-hidden={!present}
      >
        {children}
      </li>
    );
  return (
    <motion.li
      layout={animation.enabled ? 'position' : false}
      onClick={onClick}
      data-track-id={trackId}
      whileTap={animation.enabled ? { scale: 0.99 } : undefined}
      className={className}
      inert={!present}
      aria-hidden={!present}
      initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 12 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: animation.enabled ? 0.96 : 1 }}
      transition={{
        ...animation.spatial,
        opacity: {
          ...animation.effects,
          delay: animation.enabled ? Math.min(index, 7) * 0.018 : 0,
        },
      }}
    >
      {children}
    </motion.li>
  );
}
