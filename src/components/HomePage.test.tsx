import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeTrack } from '../test/fixtures';
import { HomePage } from './HomePage';

describe('Home', () => {
  it('keeps collection shortcuts without a recent-listening shelf', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(
      <HomePage
        tracks={[makeTrack({ id: 'one', title: 'One' })]}
        playlists={[]}
        playing={false}
        loading={false}
        busy={false}
        onAdd={vi.fn()}
        onMix={vi.fn()}
        onView={onView}
        onAlbum={vi.fn()}
        onArtist={vi.fn()}
        onPlaylist={vi.fn()}
        onPlay={vi.fn()}
        onFavorite={vi.fn()}
        onMore={vi.fn()}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Jump back in' })).not.toBeInTheDocument();
    const collection = screen.getByRole('region', { name: 'Your collection' });
    await user.click(within(collection).getByRole('button', { name: /songs/i }));
    expect(onView).toHaveBeenCalledWith('songs');
  });
  it('offers Windows once and remembers dismissal', async () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Windows NT 10.0',
    });
    const props = {
      tracks: [],
      playlists: [],
      playing: false,
      loading: false,
      busy: false,
      onAdd: vi.fn(),
      onMix: vi.fn(),
      onView: vi.fn(),
      onAlbum: vi.fn(),
      onArtist: vi.fn(),
      onPlaylist: vi.fn(),
      onPlay: vi.fn(),
      onFavorite: vi.fn(),
      onMore: vi.fn(),
    };
    try {
      const user = userEvent.setup();
      const view = render(<HomePage {...props} />);
      expect(screen.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
        'href',
        '/api/download/windows',
      );
      await user.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('link', { name: 'Download for Windows' })).not.toBeInTheDocument();
      view.unmount();
      render(<HomePage {...props} />);
      expect(screen.queryByRole('link', { name: 'Download for Windows' })).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: original });
    }
  });
});
