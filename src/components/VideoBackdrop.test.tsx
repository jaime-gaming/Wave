import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { findClip, rememberClip } from '../services/clipSearch';
import { VideoBackdrop } from './VideoBackdrop';
import { CLIP_STORAGE_KEY, removeClip, storeClip } from '../domain/videoClips';
import { makeTrack } from '../test/fixtures';

vi.mock('../services/clipSearch', () => ({
  findClip: vi.fn(),
  rememberClip: vi.fn(),
}));

const track = makeTrack({ id: 'track-video', title: 'Signal', artist: 'Wave Tests' });
const props = { track, time: 12, duration: 200, playing: true };

beforeEach(() => {
  vi.mocked(findClip).mockReset().mockResolvedValue({ status: 'unavailable' });
  vi.mocked(rememberClip).mockReset().mockReturnValue(null);
});

describe('video clip backdrop', () => {
  it('finds a clip by itself and opens it without the user pasting anything', async () => {
    localStorage.clear();
    const candidate = {
      videoId: 'dQw4w9WgXcQ',
      title: 'Wave Tests - Signal (Official Video)',
      author: 'Wave Tests',
      duration: 200,
    };
    vi.mocked(findClip).mockResolvedValue({ status: 'found', candidate, cached: false });
    vi.mocked(rememberClip).mockImplementation((id, found) => storeClip(id, found.videoId));
    render(<VideoBackdrop {...props} />);
    await waitFor(() =>
      expect(findClip).toHaveBeenCalledWith(
        { title: track.title, artist: track.artist, duration: track.duration },
        expect.objectContaining({ signal: expect.anything() }),
      ),
    );
    expect(rememberClip).toHaveBeenCalledWith('track-video', candidate, expect.any(Number));
    expect(await screen.findByTitle(/video clip for/i)).toBeInTheDocument();
  });

  it('has no link field: clips only come from the search', async () => {
    localStorage.clear();
    render(<VideoBackdrop {...props} />);
    expect(screen.getByText('Video clip')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use clip/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/no clip matched|unreachable|connection/i)).toBeInTheDocument(),
    );
  });

  it('mounts a muted, control-free embed for the clip it found', async () => {
    localStorage.clear();
    vi.mocked(findClip).mockResolvedValue({
      status: 'found',
      candidate: {
        videoId: 'dQw4w9WgXcQ',
        title: 'Wave Tests - Signal (Official Video)',
        author: 'Wave Tests',
        duration: 200,
      },
      cached: false,
    });
    vi.mocked(rememberClip).mockImplementation((id, found) => storeClip(id, found.videoId));
    const { container } = render(<VideoBackdrop {...props} />);
    const frame = (await screen.findByTitle(/video clip for/i)) as HTMLIFrameElement;
    const url = new URL(frame.src);
    expect(url.host).toBe('www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('controls')).toBe('0');
    expect(url.searchParams.get('mute')).toBe('1');
    expect(url.searchParams.get('disablekb')).toBe('1');
    expect(url.searchParams.get('iv_load_policy')).toBe('3');
    expect(JSON.parse(localStorage.getItem(CLIP_STORAGE_KEY) ?? '{}')).toMatchObject({
      'track-video': { videoId: 'dQw4w9WgXcQ' },
    });
    // The clip is decoration and nothing else: the song's bar is the transport.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('.video-backdrop-bar')).toBeNull();
  });

  it('closes the video when the clip is removed from the song options', async () => {
    localStorage.setItem(
      CLIP_STORAGE_KEY,
      JSON.stringify({ 'track-video': { videoId: 'dQw4w9WgXcQ', startAt: 0, addedAt: 1 } }),
    );
    render(<VideoBackdrop {...props} />);
    expect(await screen.findByTitle(/video clip for/i)).toBeInTheDocument();
    act(() => removeClip('track-video'));
    await waitFor(() => expect(screen.queryByTitle(/video clip for/i)).not.toBeInTheDocument());
    // The song is untouched: no clip record left behind.
    expect(JSON.parse(localStorage.getItem(CLIP_STORAGE_KEY) ?? '{}')).toEqual({});
  });
});
