import { blendHue } from '../domain/palette';
import { applyFavicon } from '../ui/favicon';
import { useEffect, useRef } from 'react';
import { useArtworkColor } from './useArtworkColor';
import { useWaveMotion } from '../ui/motion';

function persistPalette(h: string, s: string) {
  try {
    localStorage.setItem('wave-palette', JSON.stringify({ hue: Number(h), saturation: s }));
  } catch {
    /* Optional visual preference. */
  }
}
export function useAppPalette(
  artwork?: string,
  blend?: { from?: { artwork?: string }; progress: number; seconds: number } | null,
) {
  const palette = useArtworkColor(artwork);
  const previous = useArtworkColor(blend?.from?.artwork);
  const mixing = !!blend;
  const fromHue = (previous as Record<string, unknown>)['--art-hue'];
  const fromSaturation = (previous as Record<string, unknown>)['--art-saturation'];
  const origin = useRef<{ hue: number; saturation: number } | null>(null);
  const generation = useRef(0);
  const active = useRef<ViewTransition | undefined>(undefined);
  const motion = useWaveMotion();
  const hue = (palette as Record<string, unknown>)['--art-hue'];
  const saturation = (palette as Record<string, unknown>)['--art-saturation'];
  useEffect(() => {
    if (mixing) {
      generation.current++;
      active.current?.skipTransition();
      return;
    }
    if (artwork && hue === undefined) return;
    const request = ++generation.current;
    active.current?.skipTransition();
    const root = document.documentElement;
    const h = String(hue ?? 226),
      s = String(saturation ?? '24%');
    if (
      root.style.getPropertyValue('--wave-hue') === h &&
      root.style.getPropertyValue('--wave-saturation') === s
    ) {
      persistPalette(h, s);
      return;
    }
    const apply = () => {
      if (request !== generation.current) return;
      root.style.setProperty('--wave-hue', h);
      root.style.setProperty('--wave-saturation', s);
      persistPalette(h, s);
    };
    if (motion.enabled && document.visibilityState === 'visible' && document.startViewTransition) {
      try {
        const transition = document.startViewTransition(apply);
        active.current = transition;
        void transition.ready.catch(() => {});
        void transition.finished.catch(() => {});
      } catch {
        apply();
      }
    } else apply();
    return () => {
      generation.current = request + 1;
      active.current?.skipTransition();
    };
  }, [artwork, hue, saturation, motion.enabled, mixing]);
  // The tab follows the same hue as the interface, once per song rather than on
  // every frame of a blend: a favicon is not animated, and rewriting it twenty
  // times a second would only make the browser re-read it.
  useEffect(() => {
    applyFavicon(Number(hue ?? 226), Number.parseFloat(String(saturation ?? '24%')));
  }, [hue, saturation]);
  const progress = blend?.progress,
    seconds = blend?.seconds;
  useEffect(() => {
    const root = document.documentElement;
    if (!mixing) {
      origin.current = null;
      delete root.dataset.paletteTransition;
      root.style.removeProperty('--palette-mix-duration');
      return;
    }
    if (artwork && hue === undefined) return;
    origin.current ??= {
      hue: Number(root.style.getPropertyValue('--wave-hue') || 226),
      saturation: Number.parseFloat(root.style.getPropertyValue('--wave-saturation') || '24%'),
    };
    const p = motion.enabled ? Math.max(0, Math.min(1, progress ?? 0)) : 1;
    const h = blendHue(Number(fromHue ?? origin.current.hue), Number(hue ?? 226), p);
    const a = Number.parseFloat(String(fromSaturation ?? origin.current.saturation)),
      b = Number.parseFloat(String(saturation ?? '24%'));
    root.style.setProperty('--wave-hue', p === 1 ? String(hue ?? 226) : h.toFixed(3));
    root.style.setProperty(
      '--wave-saturation',
      p === 1 ? String(saturation ?? '24%') : `${(a + (b - a) * p).toFixed(2)}%`,
    );
    if (motion.enabled) root.dataset.paletteTransition = 'mix';
    else delete root.dataset.paletteTransition;
    root.style.setProperty('--palette-mix-duration', `${seconds ?? 4}s`);
  }, [
    mixing,
    progress,
    seconds,
    hue,
    saturation,
    fromHue,
    fromSaturation,
    artwork,
    motion.enabled,
  ]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.paletteTransition;
      document.documentElement.style.removeProperty('--palette-mix-duration');
    },
    [],
  );
}
