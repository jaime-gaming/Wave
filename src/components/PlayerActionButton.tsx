import { useCallback, useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
export type PlayerAction = 'repeat' | 'shuffle' | 'favorite' | 'clip' | 'volume' | 'play';
function actionFrames(action: PlayerAction) {
  switch (action) {
    case 'repeat':
      // Only the two loop arrows rotate inside the SVG; the outer glyph stays upright.
      return { scale: [1, 0.93, 1.05, 1] };
    case 'shuffle':
      // The crossed paths smoothly separate to parallel and rejoin on click.
      return { scale: [1, 0.94, 1.04, 1] };
    case 'favorite':
      return { scale: [1, 1.32, 0.9, 1.1, 1], rotate: [0, -8, 6, 0] };
    case 'clip':
      // The inner filmstrip scrolls upward inside its fixed frame on click.
      return { scale: [1, 0.95, 1.04, 1] };
    case 'volume':
      return { scale: [1, 0.86, 1.14, 1], x: [0, -1, 1.5, 0] };
    case 'play':
      return { scale: [1, 0.86, 1.08, 1] };
  }
}
/** Feedback belongs to the icon: no moving the transport or replaying on mount. */
export function PlayerActionButton({
  action,
  value,
  children,
  onClick,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & {
  action: PlayerAction;
  value?: string | number | boolean;
}) {
  const motionPreference = useWaveMotion();
  const controls = useAnimationControls();
  const symbolRef = useRef<HTMLSpanElement>(null);
  const pulseTimer = useRef<number | null>(null);
  const previous = useRef(value),
    last = useRef(-Infinity);

  const triggerSymbolPulse = useCallback(() => {
    const el = symbolRef.current;
    if (!el) return;
    el.classList.remove('is-pulsing');
    // Force a single reflow so consecutive clicks cleanly restart the glyph animation.
    void el.offsetWidth;
    el.classList.add('is-pulsing');
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => {
      el.classList.remove('is-pulsing');
      pulseTimer.current = null;
    }, 760);
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    };
  }, []);

  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    if (!motionPreference.enabled) {
      controls.stop();
      controls.set({ x: 0, rotate: 0, scale: 1 });
      symbolRef.current?.classList.remove('is-pulsing');
      return;
    }
    if (changed && performance.now() - last.current > 100) {
      last.current = performance.now();
      triggerSymbolPulse();
      void controls.start({
        ...actionFrames(action),
        transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
      });
    }
  }, [action, value, motionPreference.enabled, controls, triggerSymbolPulse]);
  return (
    <button
      type="button"
      {...props}
      className={`player-action-button${className ? ` ${className}` : ''}`}
      onClick={(event) => {
        if (motionPreference.enabled) {
          last.current = performance.now();
          triggerSymbolPulse();
          void controls.start({
            ...actionFrames(action),
            transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
          });
        }
        onClick?.(event);
      }}
    >
      <motion.span
        ref={symbolRef}
        className="player-action-symbol"
        aria-hidden="true"
        animate={controls}
      >
        {children}
      </motion.span>
    </button>
  );
}
