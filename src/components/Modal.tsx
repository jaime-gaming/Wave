import { useEffect, useRef, type ReactNode, type CSSProperties, type RefObject } from 'react';
import { X } from 'lucide-react';
import { motion, useIsPresent } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

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
}: {
  immediate?: boolean;
  title: string;
  fullScreen?: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  closeIcon?: ReactNode;
  headerActions?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
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
      initial={{
        opacity: animation.enabled && !immediate ? 0 : 1,
        y: animation.enabled && !immediate ? (fullScreen ? 64 : 24) : 0,
        scale: animation.enabled && !fullScreen ? 0.96 : 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        y: animation.enabled ? 16 : 0,
        scale: animation.enabled && !fullScreen ? 0.97 : 1,
      }}
      transition={{ ...animation.spatial, opacity: animation.effects }}
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
        // Both ends must be outside: padding clicks and text-selection drags preserve drafts.
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
          aria-label="Close dialog"
        >
          {closeIcon ?? <X size={20} />}
        </button>
      </div>
      {children}
    </motion.dialog>
  );
}
