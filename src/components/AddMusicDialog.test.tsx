import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddMusicDialog } from './AddMusicDialog';
import { makeTrack } from '../test/fixtures';

const setup = (overrides: Partial<Parameters<typeof AddMusicDialog>[0]> = {}) => {
  const onYouTube = vi.fn().mockResolvedValue({ ok: true, track: makeTrack({ id: 'yt' }) });
  const onLocal = vi.fn();
  const onAdded = vi.fn();
  const onClose = vi.fn();
  render(
    <AddMusicDialog
      onClose={onClose}
      onLocal={onLocal}
      onYouTube={onYouTube}
      onAdded={onAdded}
      {...overrides}
    />,
  );
  return { onYouTube, onLocal, onAdded, onClose };
};

describe('add music', () => {
  it('offers a local file or a YouTube song', async () => {
    const { onLocal, onClose } = setup();
    expect(screen.getByRole('button', { name: /import local files/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add from youtube/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /import local files/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onLocal).toHaveBeenCalled();
  });

  it('adds a pasted YouTube link and starts it', async () => {
    const { onYouTube, onAdded, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /from youtube/i }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /youtube link/i }),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await userEvent.click(screen.getByRole('button', { name: /add song/i }));
    await waitFor(() => expect(onYouTube).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ'));
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 'yt' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows why a link could not be added', async () => {
    setup({
      onYouTube: vi.fn().mockResolvedValue({ ok: false, error: 'Playlists are not songs.' }),
    });
    await userEvent.click(screen.getByRole('button', { name: /from youtube/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /youtube link/i }), 'https://x.test');
    await userEvent.click(screen.getByRole('button', { name: /add song/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Playlists are not songs.');
  });
});
