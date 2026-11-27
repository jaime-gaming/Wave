import { createRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { makeTrack } from '../test/fixtures';
import { PlayerMorphArtwork } from './PlayerMorphArtwork';

afterEach(() => vi.restoreAllMocks());
it('measures the two covers and prepares a moving cover on the player', async () => {
  const bar = document.createElement('footer');
  const mini = document.createElement('button');
  mini.className = 'compact-cover-open';
  bar.appendChild(mini);
  document.body.appendChild(bar);
  const dialog = document.createElement('dialog');
  dialog.className = 'player-modal';
  dialog.setAttribute('open', '');
  const cover = document.createElement('button');
  cover.className = 'stage-cover';
  dialog.appendChild(cover);
  document.body.appendChild(dialog);
  vi.spyOn(mini, 'getBoundingClientRect').mockReturnValue({
    left: 18,
    top: 720,
    width: 40,
    height: 40,
  } as DOMRect);
  vi.spyOn(cover, 'getBoundingClientRect').mockReturnValue({
    left: 60,
    top: 120,
    width: 260,
    height: 260,
  } as DOMRect);
  const ref = createRef<HTMLElement>();
  ref.current = bar;
  const host = document.createElement('div');
  dialog.appendChild(host);
  const view = render(<PlayerMorphArtwork barRef={ref} track={makeTrack()} />, { container: host });
  try {
    await waitFor(() =>
      expect(view.container.querySelector('.player-morph-art')).toBeInTheDocument(),
    );
    expect(dialog).toHaveClass('player-cover-morph-ready');
    expect(view.container.querySelector('.player-morph-art')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  } finally {
    view.unmount();
    expect(dialog).not.toHaveClass('player-cover-morph-ready');
    dialog.remove();
    bar.remove();
  }
});
it('keeps the original artwork visible when geometry is unavailable', async () => {
  const bar = document.createElement('footer');
  const mini = document.createElement('button');
  mini.className = 'compact-cover-open';
  bar.appendChild(mini);
  const dialog = document.createElement('dialog');
  dialog.className = 'player-modal';
  dialog.setAttribute('open', '');
  const cover = document.createElement('button');
  cover.className = 'stage-cover';
  dialog.appendChild(cover);
  document.body.appendChild(dialog);
  const ref = createRef<HTMLElement>();
  ref.current = bar;
  const view = render(<PlayerMorphArtwork barRef={ref} track={makeTrack()} />);
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dialog).not.toHaveClass('player-cover-morphing');
    expect(view.container.querySelector('.player-morph-art')).not.toBeInTheDocument();
  } finally {
    view.unmount();
    dialog.remove();
  }
});

it('returns the same cover towards the compact player when its parent exits', async () => {
  const bar = document.createElement('footer');
  const mini = document.createElement('button');
  mini.className = 'compact-cover-open';
  bar.append(mini);
  document.body.append(bar);
  const dialog = document.createElement('dialog');
  dialog.className = 'player-modal';
  dialog.setAttribute('open', '');
  const cover = document.createElement('div');
  cover.className = 'stage-cover';
  dialog.append(cover);
  document.body.append(dialog);
  vi.spyOn(mini, 'getBoundingClientRect').mockReturnValue({
    left: 18,
    top: 720,
    width: 40,
    height: 40,
  } as DOMRect);
  vi.spyOn(cover, 'getBoundingClientRect').mockReturnValue({
    left: 60,
    top: 120,
    width: 260,
    height: 260,
  } as DOMRect);
  const ref = createRef<HTMLElement>();
  ref.current = bar;
  const host = document.createElement('div');
  dialog.append(host);
  const scene = (show: boolean) => (
    <AnimatePresence>
      {show && (
        <motion.div key="stage" exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
          <PlayerMorphArtwork barRef={ref} track={makeTrack()} />
        </motion.div>
      )}
    </AnimatePresence>
  );
  const view = render(scene(true), { container: host });
  try {
    const art = await waitFor(() => {
      const node = host.querySelector<HTMLElement>('.player-morph-art');
      expect(node).not.toBeNull();
      return node!;
    });
    await waitFor(() => expect(parseFloat(art.style.width)).toBeGreaterThan(250), {
      timeout: 2000,
    });
    view.rerender(scene(false));
    await waitFor(() => expect(parseFloat(art.style.width)).toBeLessThan(180), { timeout: 2000 });
    expect(parseFloat(art.style.opacity)).toBeGreaterThan(0.9);
  } finally {
    view.unmount();
    dialog.remove();
    bar.remove();
  }
});
