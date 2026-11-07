import { useEffect } from 'react';
import { useWaveMotion } from '../ui/motion';
/** Local press feedback, clipped to the pressed control and removed after completion. */
export function useInteractionRipples() {
  const motion = useWaveMotion();
  useEffect(() => {
    if (!motion.enabled) return;
    const active = new Map<HTMLElement, Animation>();
    const discard = (node: HTMLElement, animation: Animation) => {
      animation.cancel();
      const button = node.parentElement;
      node.remove();
      active.delete(node);
      if (!button?.querySelector('.wave-ripple')) button?.classList.remove('ripple-anchor');
    };
    const press = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && (event.repeat || !['Enter', ' '].includes(event.key)))
        return;
      if (
        typeof PointerEvent !== 'undefined' &&
        event instanceof PointerEvent &&
        event.button !== 0
      )
        return;
      const button =
        event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (
        !button ||
        button.disabled ||
        button.closest('[inert]') ||
        button.getAttribute('aria-disabled') === 'true' ||
        !button.matches(
          '.filled-button,.tonal-button,.icon-button,.stage-play,.mini-play,.library-tabs button,.settings-menu-item,.rail-collection button',
        ) ||
        typeof button.animate !== 'function'
      )
        return;
      // One response per control, eight across the app: rapid input cannot build a ripple wall.
      for (const [node, animation] of active) {
        if (node.parentElement === button || active.size >= 8) {
          discard(node, animation);
        }
      }
      const bounds = button.getBoundingClientRect(),
        size = Math.max(bounds.width, bounds.height) * 2;
      const ripple = document.createElement('span');
      ripple.className = 'wave-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      Object.assign(ripple.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${(event instanceof KeyboardEvent ? bounds.width / 2 : event.clientX - bounds.left) - size / 2}px`,
        top: `${(event instanceof KeyboardEvent ? bounds.height / 2 : event.clientY - bounds.top) - size / 2}px`,
      });
      if (getComputedStyle(button).position === 'static') button.classList.add('ripple-anchor');
      button.append(ripple);
      const animation = ripple.animate(
        [
          { transform: 'scale(0)', opacity: 0.12 },
          { transform: 'scale(1)', opacity: 0 },
        ],
        { duration: 340, easing: 'cubic-bezier(.2,0,0,1)' },
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
    document.addEventListener('keydown', press);
    return () => {
      document.removeEventListener('pointerdown', press);
      document.removeEventListener('keydown', press);
      for (const [node, animation] of active) discard(node, animation);
      active.clear();
    };
  }, [motion.enabled]);
}
