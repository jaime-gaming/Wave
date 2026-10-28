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

/**
 * The player's own colours, including while two songs are meeting.
 *
 * The bar and the stage take their tint from the cover. During a mix the cover
 * is two covers, and the previous code simply dropped the tint for the length of
 * the blend — which made the whole player snap to the default blue exactly when
 * the two songs were over each other, and snap back afterwards. That flash is
 * precisely where a handover should feel smoothest, so the two palettes are now
 * interpolated along the same progress value the sleeve uses.
 */
export function usePlayerColors(artwork: string | undefined, blend: Blend): CSSProperties {
  const current = useArtworkColor(artwork);
  const outgoing = useArtworkColor(blend?.from?.artwork);
  const incoming = useArtworkColor(blend?.to?.artwork);
  if (!blend) return current;
  const from = outgoing as Record<string, unknown>;
  const to = incoming as Record<string, unknown>;
  const hueFrom = from['--art-hue'];
  const hueTo = to['--art-hue'];
  // A cover that has not been sampled yet has no hue: keep the current tint
  // rather than jumping to a number nobody chose.
  if (hueFrom === undefined || hueTo === undefined) return current;
  const progress = Math.max(0, Math.min(1, blend.progress));
  const saturationFrom = number(from['--art-saturation'], 24);
  const saturationTo = number(to['--art-saturation'], 24);
  return {
    '--art-hue': Math.round(blendHue(Number(hueFrom), Number(hueTo), progress)),
    '--art-saturation': `${Math.round(saturationFrom + (saturationTo - saturationFrom) * progress)}%`,
  } as CSSProperties;
}
