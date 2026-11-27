import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { Artwork } from './Artwork';
import type { Track } from '../domain/types';

type Box = { left: number; top: number; width: number; height: number };
function validMorphBox(box: Box): boolean {
  return (
    [box.left, box.top, box.width, box.height].every(Number.isFinite) &&
    box.width > 0 &&
    box.height > 0
  );
}

export function PlayerMorphArtwork({
  barRef,
  track,
}: {
  barRef: RefObject<HTMLElement | null>;
  track: Track;
}) {
  const present = useIsPresent();
  const [bounds, setBounds] = useState<{ mini: Box; full: Box } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    if (!present && ghost.current) ghost.current.style.visibility = 'visible';
  }, [present]);
  useEffect(() => {
    const sourceBar = barRef.current;

    let dialog: HTMLDialogElement | null = null;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      const mini = sourceBar?.querySelector('.compact-cover-open')?.getBoundingClientRect();
      const full = dialog?.querySelector('.stage-cover')?.getBoundingClientRect();
      if (!mini || !full || !validMorphBox(mini) || !validMorphBox(full)) return false;
      const box = ({ left, top, width, height }: Box) => ({ left, top, width, height });
      const next = { mini: box(mini), full: box(full) };
      setBounds((previous) => {
        if (
          previous &&
          (['mini', 'full'] as const).every((key) =>
            (['left', 'top', 'width', 'height'] as const).every(
              (field) => previous[key][field] === next[key][field],
            ),
          )
        )
          return previous;
        return next;
      });
      return true;
    };
    const frame = requestAnimationFrame(() => {
      dialog = document.querySelector<HTMLDialogElement>('dialog.player-modal[open]');
      if (!measure()) return;
      dialog?.classList.add('player-cover-morph-ready', 'player-cover-morphing');
      sourceBar?.classList.add('player-cover-morph-source');
      window.addEventListener('resize', measure);
      window.visualViewport?.addEventListener('resize', measure);
      window.visualViewport?.addEventListener('scroll', measure);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        const cover = dialog?.querySelector('.stage-cover');
        if (cover) observer.observe(cover);
        const compact = sourceBar?.querySelector('.compact-cover-open');
        if (compact) observer.observe(compact);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      observer?.disconnect();
      sourceBar?.classList.remove('player-cover-morph-source');
      dialog?.classList.remove('player-cover-morph-ready', 'player-cover-morphing');
    };
  }, [barRef]);
  if (!bounds) return null;
  return (
    <motion.div
      className="player-morph-art"
      ref={ghost}
      style={{ visibility: settled && present ? 'hidden' : 'visible' }}
      aria-hidden="true"
      initial={{
        left: bounds.mini.left,
        top: bounds.mini.top,
        width: bounds.mini.width,
        height: bounds.mini.height,
        borderRadius: 12,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
        opacity: 1,
      }}

      animate={
        present
          ? {
              left: bounds.full.left,
              top: bounds.full.top,
              width: bounds.full.width,
              height: bounds.full.height,
              borderRadius: 30,
              boxShadow: '0 20px 64px rgba(0, 0, 0, 0.28)',
              opacity: 1,
            }
          : {
              left: bounds.mini.left,
              top: bounds.mini.top,
              width: bounds.mini.width,
              height: bounds.mini.height,
              borderRadius: 12,
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
              opacity: 1,
            }
      }
      transition={{
        duration: 0.48,
        ease: [0.22, 1, 0.36, 1],
        opacity: { duration: present ? 0.14 : 0, ease: 'easeInOut' },
      }}
      onAnimationComplete={() => {
        if (present && !settled) {
          if (ghost.current) ghost.current.style.visibility = 'hidden';
          document.querySelector('dialog.player-modal')?.classList.remove('player-cover-morphing');
          setSettled(true);
        }
      }}
    >
      <Artwork track={track} />
    </motion.div>
  );
}
