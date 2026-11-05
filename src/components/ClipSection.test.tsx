import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { ClipSection } from './ClipSection';
import { makeTrack } from '../test/fixtures';
import { getClip, loadClips } from '../domain/videoClips';

beforeEach(() => localStorage.clear());
it('sets scheme-less custom videos inside the song editor without submitting its form', async () => {
  const user = userEvent.setup();
  let submitted = false;
  const { container } = render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted = true;
      }}
    >
      <ClipSection track={makeTrack()} />
    </form>,
  );
  expect(container.querySelectorAll('form')).toHaveLength(1);
  await user.type(
    screen.getByRole('textbox', { name: 'YouTube link for this clip' }),
    'youtu.be/dQw4w9WgXcQ?t=42',
  );
  await user.click(screen.getByRole('button', { name: 'Use this video' }));
  expect(getClip('signal', loadClips())).toMatchObject({ videoId: 'dQw4w9WgXcQ', startAt: 42 });
  expect(submitted).toBe(false);
});
it('accepts a bare id and rejects unrelated links', async () => {
  const user = userEvent.setup();
  render(<ClipSection track={makeTrack()} />);
  const input = screen.getByRole('textbox', { name: 'YouTube link for this clip' });
  await user.type(input, 'https://example.com/video');
  await user.click(screen.getByRole('button', { name: 'Use this video' }));
  expect(input).toHaveAttribute('aria-invalid', 'true');
  await user.clear(input);
  await user.type(input, 'dQw4w9WgXcQ');
  await user.click(screen.getByRole('button', { name: 'Use this video' }));
  expect(getClip('signal', loadClips())?.videoId).toBe('dQw4w9WgXcQ');
});
