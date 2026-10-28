import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlayerColors } from './usePlayerColors';

/**
 * The two covers are sampled independently; the hook is only interesting for
 * what it does with both at once, so the sampler is replaced by a lookup table.
 */
vi.mock('./useArtworkColor', () => ({
  useArtworkColor: (artwork?: string) => {
    const table: Record<string, { hue: number; saturation: string }> = {
      blue: { hue: 220, saturation: '30%' },
      orange: { hue: 20, saturation: '40%' },
    };
    const entry = artwork ? table[artwork] : undefined;
    return entry ? { '--art-hue': entry.hue, '--art-saturation': entry.saturation } : {};
  },
}));

describe('the player colours during a mix', () => {
  it('keeps the current tint when nothing is blending', () => {
    expect(usePlayerColors('blue', null).valueOf()).toMatchObject({ '--art-hue': 220 });
  });

  it('interpolates between the two covers instead of dropping the tint', () => {
    // Dropping it here is what made the whole player flash to the default blue
    // at the exact moment the two songs met.
    const { result, rerender } = renderHook(
      ({ progress }: { progress: number }) =>
        usePlayerColors('blue', {
          from: { artwork: 'blue' },
          to: { artwork: 'orange' },
          progress,
        }),
      { initialProps: { progress: 0 } },
    );
    const style = (value: Record<string, unknown>) => ({
      hue: value['--art-hue'] as number,
      saturation: value['--art-saturation'] as string,
    });
    expect(style(result.current as Record<string, unknown>)).toEqual({
      hue: 220,
      saturation: '30%',
    });
    rerender({ progress: 0.5 });
    // Halfway round the short way (220 → 380 is +160°, so 300, not 120).
    expect(style(result.current as Record<string, unknown>).hue).toBe(300);
    rerender({ progress: 1 });
    expect(style(result.current as Record<string, unknown>)).toEqual({
      hue: 20,
      saturation: '40%',
    });
  });

  it('falls back to the current tint while a cover is still being sampled', () => {
    const { result } = renderHook(() =>
      usePlayerColors('blue', {
        from: { artwork: 'blue' },
        to: { artwork: 'unknown' },
        progress: 1,
      }),
    );
    expect((result.current as Record<string, unknown>)['--art-hue']).toBe(220);
  });

  it('clamps a stray progress value', () => {
    const { result } = renderHook(() =>
      usePlayerColors(undefined, {
        from: { artwork: 'blue' },
        to: { artwork: 'orange' },
        progress: 42,
      }),
    );
    expect((result.current as Record<string, unknown>)['--art-hue']).toBe(20);
  });
});
