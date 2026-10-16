import { useEffect } from 'react';
import { useWaveMotion } from '../ui/motion';
/** Local press feedback, clipped to the pressed control and removed after completion. */
export function useInteractionRipples() {
  const motion = useWaveMotion();
  useEffect(() => {
    if (!motion.enabled) return;
    const active = new Map<HTMLElement, Animation>();
    const press = (event: PointerEvent) => {
      const button = (event.target as Element)?.closest<HTMLButtonElement>('button');
      if (
        !button ||
        button.disabled ||
        !button.matches(
          '.filled-button,.tonal-button,.icon-button,.stage-play,.mini-play,.library-tabs button',
        ) ||
        typeof button.animate !== 'function'
      )
        return;
      const bounds = button.getBoundingClientRect(),
        size = Math.max(bounds.width, bounds.height) * 2;
      const ripple = document.createElement('span');
      ripple.className = 'wave-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      Object.assign(ripple.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${event.clientX - bounds.left - size / 2}px`,
        top: `${event.clientY - bounds.top - size / 2}px`,
      });
      if (getComputedStyle(button).position === 'static') button.classList.add('ripple-anchor');
      button.append(ripple);
      const animation = ripple.animate(
        [
          { transform: 'scale(0)', opacity: 0.18 },
          { transform: 'scale(1)', opacity: 0 },
        ],
        { duration: 460, easing: 'cubic-bezier(.2,0,0,1)' },
      );
      active.set(ripple, animation);
      void animation.finished
        .catch(() => {})
        .finally(() => {
          ripple.remove();
          active.delete(ripple);
          if (!button.querySelector('.wave-ripple')) button.classList.remove('ripple-anchor');
        });
    };
    document.addEventListener('pointerdown', press, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', press);
      for (const [node, animation] of active) {
        animation.cancel();
        node.remove();
      }
    };
  }, [motion.enabled]);
}
