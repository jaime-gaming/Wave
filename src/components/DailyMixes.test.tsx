import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTrack } from '../test/fixtures';
import { DailyMixes } from './DailyMixes';

const rockTracks = (count = 8) =>
  Array.from({ length: count }, (_, i) =>
    makeTrack({
      id: `rock-${i}`,
      title: `Rock ${i}`,
      artist: `Artist ${i}`,
      genres: ['Rock'],
      artwork: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><text>${i}</text></svg>`,
      blob: undefined,
    }),
  );

describe('DailyMixes', () => {
  it('withholds mixes under 7 songs, while loading or importing, and delivers once complete', () => {
    const tracks = rockTracks(8);
    const onOpen = vi.fn();
    const { rerender } = render(
      <DailyMixes tracks={rockTracks(6)} loading={false} busy={false} onOpen={onOpen} />,
    );
    expect(screen.queryByRole('region', { name: 'Daily mixes' })).not.toBeInTheDocument();

    rerender(<DailyMixes tracks={tracks} loading={false} busy={true} onOpen={onOpen} />);
    expect(screen.queryByRole('region', { name: 'Daily mixes' })).not.toBeInTheDocument();

    rerender(<DailyMixes tracks={tracks} loading={true} busy={false} onOpen={onOpen} />);
    expect(screen.queryByRole('region', { name: 'Daily mixes' })).not.toBeInTheDocument();

    rerender(<DailyMixes tracks={tracks} loading={false} busy={false} onOpen={onOpen} />);
    expect(screen.getByRole('region', { name: 'Daily mixes' })).toBeInTheDocument();
  });

  it('keeps the exact same cover sleeves across listening updates and track edits', () => {
    const tracks = rockTracks();
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
