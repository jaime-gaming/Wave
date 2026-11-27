import { createRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { act, render, waitFor } from '@testing-library/react';
import { PlaybackClock } from '../hooks/playbackClock';
import { expect, it, vi } from 'vitest';
import { PlayerMorphControls } from './PlayerMorphControls';

it('moves available transport controls in both directions and restores them after resizing', async () => {
  const bar = document.createElement('footer');
  const mini = document.createElement('button');
  mini.className = 'mini-play';
  bar.append(mini);
  document.body.append(bar);
  const dialog = document.createElement('dialog');
  dialog.className = 'player-modal';
  dialog.setAttribute('open', '');
  const stage = document.createElement('button');
  stage.className = 'stage-play';
  dialog.append(stage);
  document.body.append(dialog);
  vi.spyOn(mini, 'getBoundingClientRect').mockReturnValue({
    left: 20,
    top: 700,
    width: 40,
    height: 40,
  } as DOMRect);
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    left: 120,
    top: 400,
    width: 80,
    height: 80,
  } as DOMRect);
  const ref = createRef<HTMLElement>();
  ref.current = bar;
  const host = document.createElement('div');
  dialog.append(host);
  const scene = (show: boolean) => (
    <AnimatePresence>
      {show && (
        <motion.div key="stage" exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
          <PlayerMorphControls barRef={ref} playing />
        </motion.div>
      )}
    </AnimatePresence>
  );
  const view = render(scene(true), { container: host });
  try {
    const control = await waitFor(() => {
      const node = host.querySelector<HTMLElement>('.player-morph-control--play');
      expect(node).not.toBeNull();
      return node!;
    });
    expect(dialog).toHaveClass('morph-has-play');
    await waitFor(() => expect(parseFloat(control.style.width)).toBeGreaterThan(75), {
      timeout: 2000,
    });
    await waitFor(() => expect(dialog).not.toHaveClass('player-controls-morphing'), {
      timeout: 2000,
    });
    window.dispatchEvent(new Event('resize'));
    expect(dialog).not.toHaveClass('player-controls-morphing');
    view.rerender(scene(false));
    await waitFor(() => expect(parseFloat(control.style.width)).toBeLessThan(55), {
      timeout: 2000,
    });
  } finally {
    view.unmount();
    dialog.remove();
    bar.remove();
    vi.restoreAllMocks();
  }
});

it('carries the song identity and progress when both endpoints exist', async () => {
  const bar = document.createElement('footer');
  bar.innerHTML =
    '<button class="compact-title-open"></button><div class="compact-seek"><div class="wave-seek"></div></div>';
  document.body.append(bar);
  const dialog = document.createElement('dialog');
  dialog.className = 'player-modal';
  dialog.setAttribute('open', '');
  dialog.innerHTML =
    '<div class="stage-track"></div><div class="stage-transport"><div class="wave-seek"></div></div>';
  document.body.append(dialog);
  for (const node of [...bar.querySelectorAll('*'), ...dialog.querySelectorAll('*')]) {
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
      left: 30,
      top: 30,
      width: 160,
      height: 30,
    } as DOMRect);
  }
  const ref = createRef<HTMLElement>();
  ref.current = bar;
  const host = document.createElement('div');
  dialog.append(host);
  const { makeTrack } = await import('../test/fixtures');
  const clock = new PlaybackClock();
  clock.set(30, true);
  const view = render(
    <PlayerMorphControls
      barRef={ref}
      playing={false}
      track={makeTrack({ title: 'Signal', artist: 'Wave' })}
      time={30}
      clock={clock}
      duration={120}
    />,
    { container: host },
  );
  try {
    await waitFor(() => expect(dialog).toHaveClass('morph-has-title', 'morph-has-seek'));
    expect(host.querySelector('.player-morph-control--title')).toHaveTextContent('Signal');
    expect(host.querySelector<HTMLInputElement>('.player-morph-control--seek input')?.value).toBe(
      '30',
    );
    expect(host.querySelector('.player-morph-control--title')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    view.rerender(
      <PlayerMorphControls
        barRef={ref}
        playing
        track={makeTrack({ title: 'Another song', artist: 'Wave' })}
        time={60}
        clock={clock}
        duration={120}
      />,
    );
    expect(host.querySelector('.player-morph-control--title')).toHaveTextContent('Another song');
    act(() => clock.set(60, true));
    expect(host.querySelector<HTMLInputElement>('.player-morph-control--seek input')?.value).toBe(
      '60',
    );
  } finally {
    view.unmount();
    dialog.remove();
    bar.remove();
    vi.restoreAllMocks();
  }
});
