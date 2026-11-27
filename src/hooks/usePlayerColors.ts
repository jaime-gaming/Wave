import type { CSSProperties } from 'react';
import { blendHue } from '../domain/palette';
import { useArtworkColor } from './useArtworkColor';

type Blend = {
  from?: { artwork?: string };
  to?: { artwork?: string };
  progress: number;
} | null;

const number = (value: unknown, fallback: number) => {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function usePlayerColors(artwork: string | undefined, blend: Blend): CSSProperties {
  const current = useArtworkColor(artwork);
  const outgoing = useArtworkColor(blend?.from?.artwork);
  const incoming = useArtworkColor(blend?.to?.artwork);
  if (!blend) return current;
  const from = outgoing as Record<string, unknown>;
  const to = incoming as Record<string, unknown>;
  const hueFrom = from['--art-hue'];
  const hueTo = to['--art-hue'];

  if (hueFrom === undefined || hueTo === undefined) return current;
  const progress = Math.max(0, Math.min(1, blend.progress));
  const saturationFrom = number(from['--art-saturation'], 24);
  const saturationTo = number(to['--art-saturation'], 24);
  return {
    '--art-hue': Math.round(blendHue(Number(hueFrom), Number(hueTo), progress)),
    '--art-saturation': `${Math.round(saturationFrom + (saturationTo - saturationFrom) * progress)}%`,
  } as CSSProperties;
}
