import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { IdleStage } from './IdleStage';
import { useWaveMotion } from '../ui/motion';
import { makeTrack } from '../test/fixtures';
import type { MixCue } from '../ui/mixCue';

function stage(overrides: Partial<ComponentProps<typeof IdleStage>> = {}) {
  const animation = renderHook(() => useWaveMotion()).result.current;
  return render(
    <IdleStage
      track={makeTrack()}
      time={30}
      duration={60}
      hasVideo={false}
      mixing={false}
      animation={animation}
      playing
      onSeek={() => {}}
      onEditLyrics={() => {}}
      {...overrides}
    />,
  );
}

describe('IdleStage — the Wave 3.0 listening room', () => {
  it('shows one lit sleeve and the credits, with no new controls', () => {
    const { container } = stage();
    const scene = container.querySelector('.idle-stage-v3');
    expect(scene).toBeTruthy();
    expect(scene?.classList.contains('without-lyrics')).toBe(true);
    expect(scene?.classList.contains('with-video')).toBe(false);
    expect(screen.getByLabelText('Immersive listening')).toBeInTheDocument();
    expect(screen.getByText('Now playing')).toBeInTheDocument();
    expect(screen.getByText('Signal')).toBeInTheDocument();
    expect(screen.getByText('Wave Tests')).toBeInTheDocument();
    expect(container.querySelector('.idle-room__glow')).toBeTruthy();
    expect(container.querySelector('.idle-sleeve')).toBeTruthy();
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('draws the progress at the real position, with a head on the line', () => {
    const { container } = stage();
    expect(container.querySelector<HTMLElement>('.idle-progress > span')?.style.transform).toBe(
      'scaleX(0.5)',
    );
    expect(container.querySelector<HTMLElement>('.idle-progress__head')?.style.left).toBe('50%');
  });

  it('adapts to video and announces a mix without changing the scene identity', () => {
    const track = makeTrack();
    const next = makeTrack({ id: 'next', title: 'Horizon' });
    const cue: MixCue = { from: track, to: next, seconds: 6, progress: 0.4 };
    const { container } = stage({ hasVideo: true, mixing: true, mixCue: cue });
    const scene = container.querySelector('.idle-stage-v3');
    expect(scene?.classList.contains('with-video')).toBe(true);
    expect(scene?.classList.contains('is-mixing')).toBe(true);
    expect(container.querySelector('.idle-mix-cue')).toBeTruthy();
    expect(screen.getByText('Mixing')).toBeInTheDocument();
  });

  it('keeps the scene when there is no duration to show', () => {
    const { container } = stage({ duration: 0 });
    expect(container.querySelector<HTMLElement>('.idle-progress > span')?.style.transform).toBe(
      'scaleX(0)',
    );
    expect(container.querySelector('.idle-time__remaining')).toBeNull();
  });
});
