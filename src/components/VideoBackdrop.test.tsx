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
        {
          title: track.title,
          artist: track.artist,
          duration: track.duration,
          fileName: track.fileName,
          rolesReviewed: track.rolesReviewed,
        },
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

    expect(JSON.parse(localStorage.getItem(CLIP_STORAGE_KEY) ?? '{}')).toEqual({});
  });
});

describe('keeping the picture on the song', () => {
  const open = async () => {
    localStorage.setItem(
      CLIP_STORAGE_KEY,
      JSON.stringify({ 'track-video': { videoId: 'dQw4w9WgXcQ', startAt: 0, addedAt: 1 } }),
    );
    const view = render(<VideoBackdrop {...props} />);
    const frame = (await screen.findByTitle(/video clip for/i)) as HTMLIFrameElement;
    const sent: Array<Record<string, unknown>> = [];
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        postMessage: (raw: string) => sent.push(JSON.parse(raw) as Record<string, unknown>),
      },
    });
    return { view, frame, sent };
  };

  it('asks the player to report, then seeks it when the picture is behind', async () => {
    const { frame, sent } = await open();

    await waitFor(() => expect(sent.some((m) => m.event === 'listening')).toBe(true));
    expect(sent[0]).toMatchObject({ event: 'listening', id: 'wave-clip-player' });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.youtube-nocookie.com',
          data: JSON.stringify({
            event: 'infoDelivery',
            info: { currentTime: 0.4, playerState: 1, duration: 200 },
          }),
          source: frame.contentWindow,
        }),
      );
    });
    await waitFor(
      () => expect(sent.some((m) => m.event === 'command' && m.func === 'seekTo')).toBe(true),
      { timeout: 2_000 },
    );
    const seek = sent.find((m) => m.event === 'command' && m.func === 'seekTo');

    const [to, allowSeekAhead] = seek?.args as [number, boolean];
    expect(to).toBeGreaterThanOrEqual(12);
    expect(to).toBeLessThan(13);
    expect(allowSeekAhead).toBe(true);
  });

  it('leaves a picture that is already where the song is', async () => {
    const { frame, sent } = await open();
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    sent.length = 0;
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.youtube-nocookie.com',
          data: JSON.stringify({
            event: 'infoDelivery',
            info: { currentTime: 12.05, playerState: 1, duration: 200 },
          }),
          source: frame.contentWindow,
        }),
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(sent.some((m) => m.func === 'seekTo')).toBe(false);
  });

  it('ignores messages from anywhere else', async () => {
    const { sent } = await open();
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    sent.length = 0;
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.youtube-nocookie.com',
          data: JSON.stringify({
            event: 'infoDelivery',
            info: { currentTime: 0, playerState: 1, duration: 200 },
          }),
          source: window,
        }),
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(sent.some((m) => m.event === 'command')).toBe(false);
  });
});
