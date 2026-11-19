import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTrack } from '../test/fixtures';
import { DailyMixes } from './DailyMixes';

const rockTracks = (count = 8, prefix = 'rock') =>
  Array.from({ length: count }, (_, i) =>
    makeTrack({
      id: `${prefix}-${i}`,
      title: `Rock ${i}`,
      artist: `Artist ${i}`,
      genres: ['Rock'],
      artwork: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><text>${i}</text></svg>`,
      blob: undefined,
    }),
  );

describe('DailyMixes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows a skeleton loader while creating and delivers saved mixes instantaneously once ready', () => {
    const tracks = rockTracks(8, 'build');
    const onOpen = vi.fn();
    const { rerender, unmount } = render(
      <DailyMixes tracks={rockTracks(6, 'small')} loading={false} busy={false} onOpen={onOpen} />,
    );
    expect(screen.queryByRole('region', { name: 'Daily mixes' })).not.toBeInTheDocument();

    // While importing/creating with enough songs, show the friendly skeleton loader.
    rerender(<DailyMixes tracks={tracks} loading={false} busy={true} onOpen={onOpen} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Your daily mix is on its way');
    expect(status.querySelectorAll('.daily-mix-loading-art')).toHaveLength(1);
    expect(status.querySelectorAll('.daily-mix-loading-sleeve')).toHaveLength(3);
    expect(document.querySelectorAll('.daily-mix-skeleton')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Open Daily mix/i })).not.toBeInTheDocument();

    // Once complete, mixes appear and are persisted to localStorage.
    rerender(<DailyMixes tracks={tracks} loading={false} busy={false} onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Open Daily mix 1/i })).toBeInTheDocument();
    expect(localStorage.getItem('wave-daily-mixes-v2')).toBeTruthy();

    // Remounting restores today's persisted mixes instantaneously without showing a skeleton.
    unmount();
    render(<DailyMixes tracks={tracks} loading={false} busy={false} onOpen={onOpen} />);
    expect(screen.queryByText('Your daily mix is on its way')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Daily mix 1/i })).toBeInTheDocument();
  });

  it('keeps the exact same cover sleeves across listening updates and track edits', () => {
    const tracks = rockTracks(8, 'steady');
    const onOpen = vi.fn();
    const { container, rerender } = render(
      <DailyMixes tracks={tracks} loading={false} busy={false} onOpen={onOpen} />,
    );
    const readCovers = () =>
      [...container.querySelectorAll('.daily-mix-sleeves img')].map((img) =>
        img.getAttribute('src'),
      );
    const initialCovers = readCovers();
    expect(initialCovers).toHaveLength(3);

    // Toggling favorites or receiving updated listening summaries must not cycle covers.
    const updatedTracks = tracks.map((track, idx) =>
      idx === 0 ? { ...track, favorite: true } : track,
    );
    rerender(
      <DailyMixes
        tracks={updatedTracks}
        listening={{
          totalSeconds: 2400,
          totalPlays: 12,
          weekSeconds: 2400,
          weekPlays: 12,
          monthSeconds: 2400,
          days: [],
          hours: [],
          topTracks: [],
          topArtists: [{ artist: 'Artist 4', plays: 9, seconds: 1800 }],
          recent: [],
          recentTracks: [],
          uniqueTracks: 5,
          uniqueArtists: 5,
        }}
        loading={false}
        busy={false}
        onOpen={onOpen}
      />,
    );
    expect(readCovers()).toEqual(initialCovers);
  });
});
