import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { YouTubeStage } from './YouTubeStage';
import { makeTrack } from '../test/fixtures';

const track = makeTrack({
  id: 'yt-track',
  title: 'Midnight City',
  artist: 'M83',
  source: 'youtube',
  videoId: 'dQw4w9WgXcQ',
});

const baseProps = {
  track,
  volume: 1,
  seek: { seconds: 0, nonce: 0 },
  onTime: vi.fn(),
  onDuration: vi.fn(),
  onEnded: vi.fn(),
  onError: vi.fn(),
};

function deliver(frame: HTMLIFrameElement, info: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'infoDelivery', info }),
        source: frame.contentWindow,
      }),
    );
  });
}

describe('YouTube song stage', () => {
  it('embeds the video with sound and without provider controls', () => {
    render(<YouTubeStage {...baseProps} playing={false} />);
    const frame = screen.getByTitle(/youtube video for midnight city/i) as HTMLIFrameElement;
    const url = new URL(frame.src);
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('controls')).toBe('0');
    // Unlike a backdrop clip, the song's audio comes from the video itself.
    expect(url.searchParams.get('mute')).toBeNull();
    expect(screen.getByRole('link', { name: /open this song on youtube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('follows the embed clock, plays and pauses with Wave, and seeks on request', async () => {
    const onTime = vi.fn();
    const onDuration = vi.fn();
    const { rerender } = render(
      <YouTubeStage {...baseProps} onTime={onTime} onDuration={onDuration} playing={false} />,
    );
    const frame = screen.getByTitle(/youtube video for/i) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    deliver(frame, { playerState: 2, currentTime: 10, duration: 244 });
    await waitFor(() => expect(onTime).toHaveBeenCalledWith(10));
    expect(onDuration).toHaveBeenCalledWith(244);

    rerender(
      <YouTubeStage {...baseProps} onTime={onTime} onDuration={onDuration} playing={true} />,
    );
    await waitFor(() =>
      expect(post.mock.calls.some(([message]) => String(message).includes('"playVideo"'))).toBe(
        true,
      ),
    );

    rerender(
      <YouTubeStage
        {...baseProps}
        onTime={onTime}
        onDuration={onDuration}
        playing={true}
        seek={{ seconds: 42, nonce: 1 }}
      />,
    );
    await waitFor(() =>
      expect(
        post.mock.calls.some(
          ([message]) => String(message).includes('seekTo') && String(message).includes('42'),
        ),
      ).toBe(true),
    );
    deliver(frame, { playerState: 1, currentTime: 42, duration: 244 });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/playing from youtube/i),
    );
  });

  it('ignores messages from anywhere else', async () => {
    const onEnded = vi.fn();
    render(<YouTubeStage {...baseProps} onEnded={onEnded} playing={true} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            event: 'infoDelivery',
            info: { playerState: 0, currentTime: 200, videoData: { video_id: 'dQw4w9WgXcQ' } },
          }),
          source: window,
        }),
      );
    });
    expect(onEnded).not.toHaveBeenCalled();
  });
});
