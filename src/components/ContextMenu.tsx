import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export interface ContextAction {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  run: () => void;
}
export function ContextMenu({
  x,
  y,
  title,
  actions,
  onClose,
  returnFocus,
}: {
  x: number;
  y: number;
  title: string;
  actions: ContextAction[];
  onClose: () => void;
  returnFocus?: HTMLElement;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!,
      previous = returnFocus ?? document.activeElement;
    dialog.showModal();
    const position = () => {
      dialog.style.left = Math.max(8, Math.min(x, innerWidth - dialog.offsetWidth - 8)) + 'px';
      dialog.style.top = Math.max(8, Math.min(y, innerHeight - dialog.offsetHeight - 8)) + 'px';
    };
    position();
    window.addEventListener('resize', position);
    dialog
      .querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('resize', position);
      dialog.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.matches(':disabled') &&
        !previous.closest('[inert],[aria-hidden="true"]')
      )
        previous.focus({ preventScroll: true });
    };
  }, [x, y, returnFocus]);
  return (
    <dialog
      ref={ref}
      className="context-menu"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        const items = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]:not(:disabled)',
            ),
          ],
          index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          items[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div role="menu" aria-label={title}>
        <p className="context-menu__title">{title}</p>
        {actions.map((action) => (
          <button
            key={action.label}
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              onClose();
              action.run();
            }}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
