import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { WaveSeek } from './WaveSeek';
import { usePlaybackTime, type PlaybackClock } from '../hooks/playbackClock';
import {
  PlayPauseGlyph,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
} from './Glyphs';
import type { Track } from '../domain/types';

type Box = { left: number; top: number; width: number; height: number };
type Pair = {
  from: Box;
  to: Box;
  kind: 'previous' | 'play' | 'next' | 'title' | 'seek' | 'shuffle' | 'repeat' | 'volume';
  fallback?: boolean;
  fromFont?: number;
  toFont?: number;
  fromSubtitle?: number;
  toSubtitle?: number;
};
const selectors = [
  ['.mini-previous', '.stage-skip:first-child', 'previous'],
  ['.mini-play', '.stage-play', 'play'],
  ['.mini-next', '.stage-skip:last-child', 'next'],
  ['.compact-title-open', '.stage-track', 'title'],
  ['.compact-seek .wave-seek', '.stage-transport .wave-seek', 'seek'],
  ['.compact-modes button:nth-child(1)', '.stage-modes button:nth-child(1)', 'shuffle'],
  ['.compact-modes button:nth-child(2)', '.stage-modes button:nth-child(2)', 'repeat'],
  ['.compact-volume button', '.stage-volume button', 'volume'],
] as const;

function LiveMorphSeek({
  clock,
  time,
  duration,
  playing,
}: {
  clock?: PlaybackClock;
  time: number;
  duration: number;
  playing: boolean;
}) {
  return clock ? (
    <ClockMorphSeek clock={clock} duration={duration} playing={playing} />
  ) : (
    <WaveSeek time={time} duration={duration} playing={playing} onSeek={() => {}} />
  );
}

function ClockMorphSeek({
  clock,
  duration,
  playing,
}: {
  clock: PlaybackClock;
  duration: number;
  playing: boolean;
}) {
  const time = usePlaybackTime(clock);
  return <WaveSeek time={time} duration={duration} playing={playing} onSeek={() => {}} />;
}

export function PlayerMorphControls({
  barRef,
  playing,
  track,
  time = 0,
  duration = 0,
  clock,
  shuffled = false,
  repeat = 'off',
  volume = 1,
}: {
  barRef: RefObject<HTMLElement | null>;
  playing: boolean;
  track?: Track;
  time?: number;
  duration?: number;
  clock?: PlaybackClock;
  shuffled?: boolean;
  repeat?: 'off' | 'all' | 'one';
  volume?: number;
}) {
  const present = useIsPresent();
  const hasTrack = !!track;
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    if (!present) {
      document
        .querySelectorAll<HTMLElement>('dialog.player-modal .player-morph-control')
        .forEach((node) => {
          node.style.visibility = 'visible';
        });
    }
  }, [present]);
  useEffect(() => {
    const sourceBar = barRef.current;
    let dialog: HTMLDialogElement | null = null;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      dialog = document.querySelector('dialog.player-modal[open]');
      const next: Pair[] = [];
      for (const [source, target, kind] of selectors) {
        if (kind === 'title' && !hasTrack) continue;
        const sourceElement = sourceBar?.querySelector<HTMLElement>(source);
        const targetElement = dialog?.querySelector<HTMLElement>(target);
        let from = sourceElement?.getBoundingClientRect();
        const to = targetElement?.getBoundingClientRect();
        let fallback = false;
        if (
          (!from || !from.width || !from.height) &&
          ['previous', 'shuffle', 'repeat', 'volume'].includes(kind)
        ) {
          const anchor = sourceBar?.querySelector('.mini-play')?.getBoundingClientRect();
          if (anchor?.width && anchor.height) {
            from = {
              left: anchor.left + anchor.width / 2,
              top: anchor.top + anchor.height / 2,
              width: 1,
              height: 1,
            } as DOMRect;
            fallback = true;
          }
        }
        if (from && to && from.width > 0 && from.height > 0 && to.width > 0 && to.height > 0) {
          const box = (b: DOMRect): Box => ({
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
          });
          const fontSize = (node: Element | null | undefined, fallbackSize: number) => {
            const value = node ? Number.parseFloat(getComputedStyle(node).fontSize) : NaN;
            return Number.isFinite(value) && value > 0 ? value : fallbackSize;
          };
          next.push({
            from: box(from),
            to: box(to),
            kind,
            fallback,
            ...(kind === 'title'
              ? {
                  fromFont: fontSize(sourceElement?.querySelector('strong'), 13),
                  toFont: fontSize(targetElement?.querySelector('h3'), 22),
                  fromSubtitle: fontSize(sourceElement?.querySelector('.compact-subline'), 11),
                  toSubtitle: fontSize(targetElement?.querySelector('.metadata-link'), 14),
                }
              : {}),
          });
        }
      }
      setPairs((previous) => {
        if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
        return next;
      });
      const bar = sourceBar;
      for (const [, , kind] of selectors) {
        bar?.classList.toggle(
          `morph-has-${kind}`,
          next.some((pair) => pair.kind === kind && !pair.fallback),
        );
      }
      bar?.classList.toggle('player-controls-morph-source', next.length > 0);
      dialog?.classList.remove(
        'morph-has-play',
        'morph-has-previous',
        'morph-has-next',
        'morph-has-title',
        'morph-has-seek',
        'morph-has-shuffle',
        'morph-has-repeat',
        'morph-has-volume',
      );
      if (next.length) {
        dialog?.classList.add(
          'player-controls-morph-ready',
          ...next.map((pair) => `morph-has-${pair.kind}`),
        );
      }
      return next.length > 0;
    };
    const frame = requestAnimationFrame(() => {
      if (measure()) {
        dialog?.classList.add('player-controls-morphing');
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(measure);
          if (sourceBar) observer.observe(sourceBar);
          if (dialog) observer.observe(dialog);
        }
      }
    });
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      observer?.disconnect();
      sourceBar?.classList.remove(
        'player-controls-morph-source',
        ...selectors.map(([, , kind]) => `morph-has-${kind}`),
      );
      dialog?.classList.remove(
        'player-controls-morph-ready',
        'player-controls-morphing',
        'morph-has-play',
        'morph-has-previous',
        'morph-has-next',
        'morph-has-title',
        'morph-has-seek',
        'morph-has-shuffle',
        'morph-has-repeat',
        'morph-has-volume',
      );
    };
  }, [barRef, hasTrack]);
  return (
    <>
      {pairs.map(({ from, to, kind, fallback, fromFont, toFont, fromSubtitle, toSubtitle }) => (
        <motion.div
          key={kind}
          className={`player-morph-control player-morph-control--${kind}`}
          aria-hidden="true"
          style={{ visibility: settled && present ? 'hidden' : 'visible' }}
          initial={{
            ...from,
            opacity: fallback ? 0 : 1,
            ...(kind === 'title' ? { fontSize: fromFont ?? 13 } : {}),
          }}
          animate={{
            ...(present ? to : from),
            opacity: present ? 1 : fallback ? 0 : 1,
            ...(kind === 'title' ? { fontSize: present ? (toFont ?? 22) : (fromFont ?? 13) } : {}),
          }}
          transition={{
            duration: 0.48,
            ease: [0.22, 1, 0.36, 1],
            opacity: { duration: present ? (fallback ? 0.28 : 0.14) : 0, ease: 'easeInOut' },
          }}
          onAnimationComplete={() => {
            if (present && !settled) {
              const dialog = document.querySelector('dialog.player-modal');
              dialog?.querySelectorAll<HTMLElement>('.player-morph-control').forEach((node) => {
                node.style.visibility = 'hidden';
              });
              dialog?.classList.remove('player-controls-morphing');
              setSettled(true);
            }
          }}
        >
          {kind === 'play' ? (
            <PlayPauseGlyph playing={playing} size={24} />
          ) : kind === 'title' ? (
            <>
              <strong>{track?.title}</strong>
              <motion.span
                initial={{ fontSize: fromSubtitle ?? 11 }}
                animate={{ fontSize: present ? (toSubtitle ?? 14) : (fromSubtitle ?? 11) }}
                transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              >
                {track?.artist}
              </motion.span>
            </>
          ) : kind === 'seek' ? (
            <LiveMorphSeek clock={clock} time={time} duration={duration} playing={playing} />
          ) : kind === 'shuffle' ? (
            <Shuffle size={24} style={{ opacity: shuffled ? 1 : 0.7 }} />
          ) : kind === 'repeat' ? (
            repeat === 'one' ? (
              <Repeat1 size={24} />
            ) : (
              <Repeat size={24} style={{ opacity: repeat === 'all' ? 1 : 0.7 }} />
            )
          ) : kind === 'volume' ? (
            volume ? (
              <Volume2 size={24} />
            ) : (
              <VolumeX size={24} />
            )
          ) : kind === 'previous' ? (
            <SkipBack size={24} />
          ) : (
            <SkipForward size={24} />
          )}
        </motion.div>
      ))}
    </>
  );
}
