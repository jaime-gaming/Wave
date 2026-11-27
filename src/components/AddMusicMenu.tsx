import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { AddMusicDialog } from './AddMusicDialog';
import { useT } from '../i18n';
import { useWaveMotion } from '../ui/motion';
import type { Track } from '../domain/types';

type Props = {
  busy: boolean;
  label?: boolean;
  onLocal: () => void;
  onFolderFiles: (files: File[]) => void;
  onYouTube: (
    link: string,
    prefilled?: { title?: string; artist?: string; duration?: number; thumbnail?: string },
  ) => Promise<{ ok: boolean; error?: string; track?: Track }>;
  onAdded: (track: Track) => void;
  onYouTubeChoice: () => void;
};

function Panel({ id, children, vertical }: { id: string; children: ReactNode; vertical: boolean }) {
  const present = useIsPresent();
  const animation = useWaveMotion();
  return (
    <motion.div
      id={id}
      className="add-menu-panel"
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      initial={
        animation.enabled
          ? { opacity: 0, scaleX: vertical ? 1 : 0.25, scaleY: vertical ? 0.2 : 0.9 }
          : false
      }
      animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
      exit={
        animation.enabled
          ? { opacity: 0, scaleX: vertical ? 1 : 0.25, scaleY: vertical ? 0.2 : 0.9 }
          : { opacity: 0 }
      }
      transition={animation.enabled ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}

export function AddMusicMenu({
  busy,
  label = false,
  onLocal,
  onFolderFiles,
  onYouTube,
  onAdded,
  onYouTubeChoice,
}: Props) {
  const t = useT();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openedAt = useRef(0);
  const [open, setOpen] = useState(false);
  const [toRight, setToRight] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  useEffect(() => {
    if (!open) return;

    const onScroll = () => {
      if (performance.now() - openedAt.current >= 80) setOpen(false);
    };
    const onScrollIntent = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      } else if (
        ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('wheel', onScrollIntent, { passive: true, capture: true });
    window.addEventListener('touchmove', onScrollIntent, { passive: true, capture: true });
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('wheel', onScrollIntent, true);
      window.removeEventListener('touchmove', onScrollIntent, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div
      className={`add-menu${label ? ' add-menu--labelled' : ''}${open ? ' is-open' : ''}${toRight ? ' opens-right' : ''}${opensUp ? ' opens-up' : ''}`}
      ref={root}
    >
      <button
        ref={trigger}
        type="button"
        className={label ? 'tonal-button add-menu-trigger' : 'icon-button add-menu-trigger'}
        aria-label={t('Add music')}
        aria-expanded={open}
        aria-controls={id}
        disabled={busy}
        onClick={() => {
          if (!open && trigger.current) {
            openedAt.current = performance.now();
            const box = trigger.current.getBoundingClientRect();
            root.current?.style.setProperty('--add-trigger-width', `${box.width}px`);
            root.current?.style.setProperty('--add-trigger-height', `${box.height}px`);
            setToRight(box.left < 190 && window.innerWidth - box.right > 190);
            setOpensUp(label && window.innerHeight - box.bottom < 160 && box.top > 160);
          }
          setOpen((value) => !value);
        }}
      >
        <svg
          className="add-menu-glyph"
          width={label ? 18 : 24}
          height={label ? 18 : 24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path className="add-menu-glyph-vertical" d="M12 5v14" />
        </svg>
        {label && t('Add music')}
      </button>
      <AnimatePresence initial={false} mode="wait">
        {open && (
          <Panel id={id} vertical={label}>
            <AddMusicDialog
              inline
              onClose={() => setOpen(false)}
              onLocal={onLocal}
              onFolderFiles={onFolderFiles}
              onYouTube={onYouTube}
              onAdded={onAdded}
              busy={busy}
              onYouTubeChoice={() => {
                setOpen(false);
                onYouTubeChoice();
              }}
            />
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}
