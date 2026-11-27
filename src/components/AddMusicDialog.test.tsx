import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddMusicDialog } from './AddMusicDialog';
import { makeTrack } from '../test/fixtures';

vi.mock('../services/videoMeta', () => ({ searchYouTubeCatalog: vi.fn().mockResolvedValue([]) }));

const setup = (overrides: Partial<Parameters<typeof AddMusicDialog>[0]> = {}) => {
  const onYouTube = vi.fn().mockResolvedValue({ ok: true, track: makeTrack({ id: 'yt' }) });
  const onLocal = vi.fn();
  const onFolderFiles = vi.fn();
  const onAdded = vi.fn();
  const onClose = vi.fn();
  render(
    <AddMusicDialog
      onClose={onClose}
      onLocal={onLocal}
      onFolderFiles={onFolderFiles}
      onYouTube={onYouTube}
      onAdded={onAdded}
      {...overrides}
    />,
  );
  return { onYouTube, onLocal, onFolderFiles, onAdded, onClose };
};

describe('add music', () => {
  it('offers a local file or a YouTube song', async () => {
    const { onLocal, onClose } = setup();
    expect(screen.getByRole('button', { name: /from this device/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /from youtube/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /from this device/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onLocal).toHaveBeenCalled();
  });

  it('offers a whole folder, and says when the browser cannot hand one over', async () => {
    setup();
    const folder = screen.getByRole('button', { name: /add a whole folder/i });

    expect(folder).toHaveTextContent(/choose the files inside it instead/i);
    expect(folder).toBeDisabled();
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

  it('shows a dedicated setup loading screen and returns to the error on failure', async () => {
    let resolve!: (result: { ok: boolean; error: string }) => void;
    const onYouTube = vi.fn(
      () =>
        new Promise<{ ok: boolean; error: string }>((done) => {
          resolve = done;
        }),
    );
    const { onClose } = setup({ setup: true, onYouTube });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /from youtube/i }));
    await user.type(
      screen.getByRole('textbox', { name: /youtube link/i }),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await user.click(screen.getByRole('button', { name: /add song/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Bringing your music in');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: false, error: 'Please try again.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeEnabled();
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

it('never adds an old or first search result without choosing it', async () => {
  const { searchYouTubeCatalog } = await import('../services/videoMeta');
  vi.mocked(searchYouTubeCatalog).mockImplementation(async (query) => [
    {
      videoId: query === 'First' ? 'dQw4w9WgXcQ' : '9bZkp7q19f0',
      title: query,
      artist: 'Artist',
      rawTitle: query,
      author: 'Artist',
      duration: 100,
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
    },
  ]);
  const { onYouTube } = setup({ initialMode: 'youtube' });
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: /youtube link/i });
  await user.type(input, 'First');
  expect(await screen.findByRole('button', { name: /First.*Artist/i })).toBeInTheDocument();
  await user.clear(input);
  await user.type(input, 'Second');
  expect(screen.queryByRole('button', { name: /First.*Artist/i })).not.toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('button', { name: /Second.*Artist/i })).toBeInTheDocument();
  expect(onYouTube).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /Second.*Artist/i }));
  expect(onYouTube).toHaveBeenCalledWith('https://youtu.be/9bZkp7q19f0', expect.any(Object));
});

it('recovers when adding a YouTube link rejects unexpectedly', async () => {
  setup({ initialMode: 'youtube', onYouTube: vi.fn().mockRejectedValue(new Error('storage')) });
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: /youtube link/i }),
    'https://youtu.be/dQw4w9WgXcQ',
  );
  await user.click(screen.getByRole('button', { name: /add song/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('That link could not be added.');
  expect(screen.getByRole('button', { name: /add song/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeEnabled();
});
