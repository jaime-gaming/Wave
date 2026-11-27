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
        origin: 'https://www.youtube-nocookie.com',
        data: JSON.stringify({ event: 'infoDelivery', info }),
        source: frame.contentWindow,
      }),
    );
  });
}

describe('YouTube song stage', () => {
  it('cannot be focused, clicked or read as a control surface', () => {
    render(<YouTubeStage {...baseProps} playing />);
    const frame = screen.getByTitle(/youtube video for midnight city/i) as HTMLIFrameElement;
    expect(frame.tabIndex).toBe(-1);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.closest('.video-backdrop')?.className).toContain('video-backdrop');
  });

  it('embeds the video with sound and without provider controls', () => {
    render(<YouTubeStage {...baseProps} playing={false} />);
    const frame = screen.getByTitle(/youtube video for midnight city/i) as HTMLIFrameElement;
    const url = new URL(frame.src);
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('controls')).toBe('0');

    expect(url.searchParams.get('mute')).toBeNull();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
    await waitFor(() => expect(onTime).toHaveBeenLastCalledWith(42));
  });

  it('resumes after a quick pause and does not repeat an old seek', async () => {
    const { rerender } = render(
      <YouTubeStage {...baseProps} playing seek={{ seconds: 42, nonce: 1 }} />,
    );
    const frame = screen.getByTitle(/youtube video for/i) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    deliver(frame, { playerState: 1, currentTime: 42, duration: 244 });
    await waitFor(() =>
      expect(post.mock.calls.some(([m]) => String(m).includes('seekTo'))).toBe(true),
    );
    rerender(<YouTubeStage {...baseProps} playing={false} seek={{ seconds: 42, nonce: 1 }} />);
    post.mockClear();
    rerender(<YouTubeStage {...baseProps} playing seek={{ seconds: 42, nonce: 1 }} />);
    expect(post.mock.calls.some(([m]) => String(m).includes('playVideo'))).toBe(true);
    expect(post.mock.calls.some(([m]) => String(m).includes('seekTo'))).toBe(false);
  });

  it('resumes at the right moment when it is mounted again, and stays quiet when silent', async () => {
    const onTime = vi.fn();
    const { container } = render(
      <YouTubeStage {...baseProps} onTime={onTime} playing={true} startAt={37.5} silent />,
    );
    const host = container.querySelector('.video-backdrop') as HTMLElement;
    expect(host).toHaveClass('youtube-silent');
    expect(host).toHaveAttribute('aria-hidden', 'true');
    const frame = container.querySelector('iframe') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    deliver(frame, { playerState: 1, currentTime: 0, duration: 244 });
    await waitFor(() =>
      expect(
        post.mock.calls.some(
          ([message]) => String(message).includes('seekTo') && String(message).includes('37.5'),
        ),
      ).toBe(true),
    );
    expect(onTime).toHaveBeenCalledWith(37.5);
  });

  it('ignores messages from anywhere else', async () => {
    const onEnded = vi.fn();
    render(<YouTubeStage {...baseProps} onEnded={onEnded} playing={true} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.youtube-nocookie.com',
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

  it('offers a user-initiated retry when autoplay is blocked', () => {
    render(<YouTubeStage {...baseProps} playing />);
    const frame = screen.getByTitle(/youtube video for midnight city/i) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.youtube-nocookie.com',
          data: JSON.stringify({ event: 'onAutoplayBlocked' }),
          source: frame.contentWindow,
        }),
      ),
    );
    const retry = screen.getByRole('button', { name: 'Play on YouTube' });
    post.mockClear();
    act(() => retry.click());
    expect(post.mock.calls.some(([message]) => String(message).includes('playVideo'))).toBe(true);
    deliver(frame, { playerState: 1, currentTime: 1, duration: 244 });
    expect(screen.queryByRole('button', { name: 'Play on YouTube' })).not.toBeInTheDocument();
  });

  it('announces listening handshake on load so YouTube streams progress events', () => {
    render(<YouTubeStage {...baseProps} playing={false} />);
    const frame = screen.getByTitle(/youtube video for midnight city/i) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });
    expect(
      post.mock.calls.some(([message]) => String(message).includes('"event":"listening"')),
    ).toBe(true);
  });
});

it('prepares an incoming video muted and reports when it actually starts', async () => {
  const onStarted = vi.fn();
  render(<YouTubeStage {...baseProps} playing startGain={0} gain={0} onStarted={onStarted} />);
  const frame = screen.getByTitle(/youtube video for/i) as HTMLIFrameElement;
  expect(new URL(frame.src).searchParams.get('mute')).toBe('1');
  expect(onStarted).not.toHaveBeenCalled();
  deliver(frame, { playerState: 1, currentTime: 0.1, duration: 244 });
  await waitFor(() => expect(onStarted).toHaveBeenCalled());
});

it('ignores untrusted origins and handles a duplicate end only once', () => {
  const onEnded = vi.fn();
  render(<YouTubeStage {...baseProps} onEnded={onEnded} playing />);
  const frame = screen.getByTitle(/youtube video for/i) as HTMLIFrameElement;
  const send = (origin: string, event: string, info: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin,
          source: frame.contentWindow,
          data: JSON.stringify({ event, info }),
        }),
      );
    });
  send('https://example.com', 'onStateChange', 0);
  expect(onEnded).not.toHaveBeenCalled();
  send('https://www.youtube-nocookie.com', 'onStateChange', 0);
  send('https://www.youtube-nocookie.com', 'infoDelivery', {
    playerState: 0,
    currentTime: 244,
    duration: 244,
  });
  expect(onEnded).toHaveBeenCalledTimes(1);
  send('https://www.youtube.com', 'onStateChange', 1);
  send('https://www.youtube.com', 'onStateChange', 0);
  expect(onEnded).toHaveBeenCalledTimes(2);
});
