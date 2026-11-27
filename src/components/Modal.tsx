import { useEffect, useRef, type ReactNode, type CSSProperties, type RefObject } from 'react';
import { X } from './Glyphs';
import { motion, useIsPresent, type TargetAndTransition, type Transition } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

import { useT } from '../i18n';
function outsideDialog(dialog: HTMLDialogElement, x: number, y: number) {
  const bounds = dialog.getBoundingClientRect();
  return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
}

export function Modal({
  title,
  onClose,
  children,
  className = '',
  style,
  closeIcon,
  headerActions,
  returnFocusRef,
  closeDisabled = false,
  fullScreen = false,
  immediate = false,
  enterMotion,
  exitMotion,
  exitTransition,
  placement = 'center',
}: {
  placement?: 'center' | 'side';
  immediate?: boolean;
  title: string;
  fullScreen?: boolean;
  closeDisabled?: boolean;

  enterMotion?: TargetAndTransition;

  exitMotion?: TargetAndTransition;
  exitTransition?: Transition;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  closeIcon?: ReactNode;
  headerActions?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const backdropStart = useRef(false);
  const animation = useWaveMotion();
  const present = useIsPresent();
  useEffect(() => {
    const dialog = ref.current;
    const previous = returnFocusRef?.current ?? document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      const remaining = [...document.querySelectorAll('dialog[open]')];
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.matches(':disabled') &&
        !previous.closest('[inert], [aria-hidden="true"]') &&
        (!remaining.length || remaining.some((other) => other.contains(previous)))
      ) {
        previous.focus();
        if (document.activeElement === previous) return;
      }
      if (!remaining.length) document.getElementById('main')?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);
  return (
    <motion.dialog
      initial={
        animation.enabled && !immediate && enterMotion
          ? enterMotion
          : {
              opacity: animation.enabled && !immediate ? 0 : 1,
              x: animation.enabled && !immediate && placement === 'side' ? 24 : 0,
              y:
                animation.enabled && !immediate && placement !== 'side'
                  ? fullScreen
                    ? 28
                    : 14
                  : 0,

              scale:
                animation.enabled && !immediate && placement !== 'side'
                  ? fullScreen
                    ? 0.99
                    : 0.98
                  : 1,
            }
      }
      animate={
        fullScreen
          ? {
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              scaleX: 1,
              scaleY: 1,
              borderRadius: '0px',
              ...(enterMotion?.clipPath ? { clipPath: 'inset(0px 0px 0px 0px round 0px)' } : {}),
            }
          : { opacity: 1, x: 0, y: 0, scale: 1 }
      }
      exit={
        animation.enabled
          ? (exitMotion ?? {
              opacity: 0,
              x: placement === 'side' ? 24 : 0,
              y: placement === 'side' ? 0 : 10,
              scale: fullScreen || placement === 'side' ? 1 : 0.99,
            })
          : { opacity: 0 }
      }
      transition={
        exitTransition ?? {
          ...(placement === 'side' ? animation.lateral : animation.spatial),
          opacity: animation.effects,
        }
      }
      aria-hidden={!present}
      inert={!present}
      ref={ref}
      className={`modal ${className}`}
      style={style}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onPointerDown={(event) => {
        backdropStart.current =
          event.target === event.currentTarget &&
          outsideDialog(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerCancel={() => {
        backdropStart.current = false;
      }}
      onClick={(event) => {
        const beganOutside = backdropStart.current;
        backdropStart.current = false;
        if (fullScreen || closeDisabled || !beganOutside || event.target !== event.currentTarget)
          return;

        if (outsideDialog(event.currentTarget, event.clientX, event.clientY)) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        {headerActions}
        <button
          className="icon-button"
          disabled={closeDisabled}
          onClick={onClose}
          aria-label={t('Close dialog')}
        >
          {closeIcon ?? <X size={20} />}
        </button>
      </div>
      {children}
    </motion.dialog>
  );
}
