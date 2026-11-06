import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
export type PlayerAction = 'repeat' | 'shuffle' | 'favorite' | 'clip' | 'volume';
function actionFrames(action: PlayerAction) {
  switch (action) {
    case 'repeat':
      return { rotate: [0, 90, 0], scale: [1, 0.9, 1] };
    case 'shuffle':
      return { x: [0, -3, 3, 0], rotate: [0, -9, 9, 0] };
    case 'favorite':
      return { scale: [1, 1.22, 0.96, 1] };
    case 'clip':
      return { rotate: [0, -10, 4, 0], scale: [1, 0.9, 1] };
    case 'volume':
      return { scale: [1, 0.88, 1.1, 1] };
  }
}
/** Feedback belongs to the icon: no moving the transport or replaying on mount. */
export function PlayerActionButton({
  action,
  value,
  children,
  onClick,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & {
  action: PlayerAction;
  value?: string | number | boolean;
}) {
  const motionPreference = useWaveMotion();
  const controls = useAnimationControls();
  const previous = useRef(value),
    last = useRef(-Infinity);
  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    if (!motionPreference.enabled) {
      controls.stop();
      controls.set({ x: 0, rotate: 0, scale: 1 });
      return;
    }
    if (changed && performance.now() - last.current > 100) {
      last.current = performance.now();
      void controls.start({
        ...actionFrames(action),
        transition: { duration: 0.28, ease: 'easeOut' },
      });
    }
  }, [action, value, motionPreference.enabled, controls]);
  return (
    <button
      type="button"
      {...props}
      onClick={(event) => {
        if (motionPreference.enabled) {
          last.current = performance.now();
          void controls.start({
            ...actionFrames(action),
            transition: { duration: 0.28, ease: 'easeOut' },
          });
        }
        onClick?.(event);
      }}
    >
      <motion.span className="player-action-symbol" aria-hidden="true" animate={controls}>
        {children}
      </motion.span>
    </button>
  );
}
