import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MotionPreference } from '../ui/motion';
import { PlayerActionButton, type PlayerAction } from './PlayerActionButton';
const controls = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), set: vi.fn() }));
vi.mock('motion/react', () => ({
  useAnimationControls: () => controls,
  motion: {
    span: ({ children, className }: { children: ReactNode; className: string }) => (
      <span className={className}>{children}</span>
    ),
  },
}));
afterEach(() => vi.clearAllMocks());
it.each<PlayerAction>(['repeat', 'shuffle', 'favorite', 'clip', 'volume'])(
  'animates %s only on interaction, without delaying its action',
  (action) => {
    const click = vi.fn();
    render(
      <PlayerActionButton action={action} aria-label="Action" onClick={click}>
        Icon
      </PlayerActionButton>,
    );
    expect(controls.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Action' }));
    expect(click).toHaveBeenCalledOnce();
    expect(controls.start).toHaveBeenCalledOnce();
    expect(controls.start).toHaveBeenCalledWith(
      expect.objectContaining({ transition: { duration: 0.28, ease: 'easeOut' } }),
    );
  },
);
it('keeps keyboard activation and ignores disabled actions', async () => {
  const user = userEvent.setup(),
    click = vi.fn();
  const { rerender } = render(
    <PlayerActionButton action="favorite" aria-label="Favorite" onClick={click}>
      Icon
    </PlayerActionButton>,
  );
  await user.tab();
  await user.keyboard('[Enter]');
  expect(click).toHaveBeenCalledOnce();
  rerender(
    <PlayerActionButton action="favorite" aria-label="Favorite" onClick={click} disabled>
      Icon
    </PlayerActionButton>,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledOnce();
});
it('animates external volume changes but not initial restoration', () => {
  const { rerender } = render(
    <PlayerActionButton action="volume" value={0.4}>
      Icon
    </PlayerActionButton>,
  );
  expect(controls.start).not.toHaveBeenCalled();
  rerender(
    <PlayerActionButton action="volume" value={0.6}>
      Icon
    </PlayerActionButton>,
  );
  expect(controls.start).toHaveBeenCalledOnce();
});
it('resets in-flight motion and remains functional when animations are disabled', () => {
  const click = vi.fn();
  render(
    <MotionPreference.Provider value={false}>
      <PlayerActionButton action="repeat" onClick={click}>
        Icon
      </PlayerActionButton>
    </MotionPreference.Provider>,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledOnce();
  expect(controls.start).not.toHaveBeenCalled();
  expect(controls.stop).toHaveBeenCalled();
  expect(controls.set).toHaveBeenCalledWith({ x: 0, rotate: 0, scale: 1 });
});
