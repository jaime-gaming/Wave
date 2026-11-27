import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MigrationSheet } from './MigrationSheet';
import { makeTrack } from '../test/fixtures';
import { fetchVideoMeta, searchYouTubeCatalog } from '../services/videoMeta';

vi.mock('../services/videoMeta', () => ({
  fetchYouTubePlaylist: vi.fn(),
  fetchVideoMeta: vi.fn(),
  searchYouTubeCatalog: vi.fn(),
}));
const setup = () => {
  const onSave = vi.fn().mockResolvedValue(true);
  const onAddVideo = vi
    .fn()
    .mockImplementation(async (video) => makeTrack({ id: `yt-${video.videoId}` }));
  render(<MigrationSheet tracks={[]} onSave={onSave} onAddVideo={onAddVideo} onClose={vi.fn()} />);
  return { onSave, onAddVideo };
};
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('importing playlists as YouTube songs', () => {
  it('previews matches, reports missing songs and saves only after confirmation in order', async () => {
    vi.mocked(searchYouTubeCatalog).mockImplementation(async (query) =>
      query.includes('Says')
        ? [
            {
              videoId: 'dQw4w9WgXcQ',
              title: 'Says',
              artist: 'Nils Frahm',
              rawTitle: 'Says',
              author: 'Nils Frahm',
              duration: 214,
              thumbnail: '',
            },
          ]
        : [],
    );
    const { onSave, onAddVideo } = setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      '#EXTM3U\n#EXTINF:214,Nils Frahm - Says\n#EXTINF:200,Unknown - Not here',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(await screen.findByText('1 of 2 songs ready')).toBeInTheDocument();
    expect(screen.getByText(/no suitable youtube match found/i)).toBeInTheDocument();
    expect(onAddVideo).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /create playlist with 1/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.any(String), ['yt-dQw4w9WgXcQ']),
    );
    expect(await screen.findByText('Your playlist is ready')).toBeInTheDocument();
  });
  it('explains when a public provider does not return a playlist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/public link could not be read/i);
  });
  it('clearly warns when a provider could only return part of a playlist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Nils Frahm - Says', partial: true }),
      }),
    );
    vi.mocked(searchYouTubeCatalog).mockResolvedValue([]);
    setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      'https://www.deezer.com/playlist/12345',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(
      await screen.findByText(/some entries could not be read or exceeded the import limit/i),
    ).toBeInTheDocument();
  });
  it('does not create an empty playlist', async () => {
    vi.mocked(searchYouTubeCatalog).mockResolvedValue([]);
    const { onSave } = setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      'Nils Frahm - Says',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(await screen.findByRole('button', { name: /create playlist with 0/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

it('unlocks the review after a rejected save and allows a safe retry', async () => {
  vi.mocked(searchYouTubeCatalog).mockResolvedValue([
    {
      videoId: 'dQw4w9WgXcQ',
      title: 'Says',
      artist: 'Nils Frahm',
      rawTitle: 'Says',
      author: 'Nils Frahm',
      duration: 214,
      thumbnail: '',
    },
  ]);
  const onSave = vi.fn().mockRejectedValueOnce(new Error('storage')).mockResolvedValueOnce(true);
  const onAddVideo = vi.fn().mockResolvedValue(makeTrack({ id: 'existing' }));
  render(<MigrationSheet tracks={[]} onSave={onSave} onAddVideo={onAddVideo} onClose={vi.fn()} />);
  await userEvent.type(
    screen.getByRole('textbox', { name: /playlist, song list or link/i }),
    'Nils Frahm - Says',
  );
  await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
  const save = await screen.findByRole('button', { name: /create playlist with 1/i });
  await userEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent(/playlist could not be saved/i);
  expect(save).toBeEnabled();
  await userEvent.click(save);
  expect(await screen.findByText('Your playlist is ready')).toBeInTheDocument();
});

it('lets the listener correct an unavailable match with a specific YouTube video', async () => {
  vi.mocked(searchYouTubeCatalog).mockResolvedValue([]);
  vi.mocked(fetchVideoMeta).mockResolvedValue({
    title: 'Says',
    artist: 'Nils Frahm',
    rawTitle: 'Says',
    author: 'Nils Frahm',
    duration: 214,
  });
  const { onAddVideo, onSave } = setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: /playlist, song list or link/i }),
    'Nils Frahm - Says',
  );
  await user.click(screen.getByRole('button', { name: /read this list/i }));
  await user.click(await screen.findByRole('button', { name: 'Change match for Says' }));
  const link = screen.getByRole('textbox', { name: 'YouTube video link for Says' });
  await user.type(link, 'not a video');
  await user.click(screen.getByRole('button', { name: 'Use this video' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Paste a valid YouTube video link.');
  await user.clear(link);
  await user.type(link, 'https://youtu.be/dQw4w9WgXcQ');
  await user.click(screen.getByRole('button', { name: 'Use this video' }));
  expect(await screen.findByText('1 of 1 songs ready')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Says on YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  await user.click(screen.getByRole('button', { name: 'Create playlist with 1' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.any(String), ['yt-dQw4w9WgXcQ']));
  expect(onAddVideo).toHaveBeenCalledWith(
    expect.objectContaining({ videoId: 'dQw4w9WgXcQ', title: 'Says' }),
  );
});
