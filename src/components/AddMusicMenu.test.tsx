import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AddMusicMenu } from './AddMusicMenu';

const props = () => ({
  busy: false,
  onLocal: vi.fn(),
  onFolderFiles: vi.fn(),
  onYouTube: vi.fn().mockResolvedValue({ ok: false }),
  onAdded: vi.fn(),
  onYouTubeChoice: vi.fn(),
});

it('opens an attached chooser, toggles back and closes on scroll', async () => {
  const user = userEvent.setup();
  const view = render(<AddMusicMenu {...props()} />);
  const trigger = screen.getByRole('button', { name: 'Add music' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /from this device/i })).toBeInTheDocument();
  expect(view.container.querySelector('.add-menu')).toHaveClass('is-open');
  fireEvent.wheel(window);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger);
  await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('supports Escape, outside clicks and both local and YouTube choices', async () => {
  const options = props();
  const user = userEvent.setup();
  render(
    <>
      <AddMusicMenu {...options} label />
      <button>Outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Add music' });
  await user.click(trigger);
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Outside' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: /from this device/i }));
  expect(options.onLocal).toHaveBeenCalledOnce();
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: /from youtube/i }));
  expect(options.onYouTubeChoice).toHaveBeenCalledOnce();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
