import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detailsQueue,
  detailsEnabled,
  detailsSummary,
  useCatalogueDetails,
  DETAILS_RETRY_MS,
  DETAILS_BATCH,
} from './useCatalogueDetails';
import { searchCatalogue } from '../services/catalogue';
import { searchDeezer, searchMusicBrainz } from '../services/musicBrainz';
import { makeTrack } from '../test/fixtures';
import type { Track } from '../domain/types';
import { rolesReviewKey } from '../domain/metadata';

vi.mock('../data/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/library')>()),
  markDetailsChecked: vi.fn(async () => null),
}));

vi.mock('../services/catalogue', () => ({
  searchCatalogue: vi.fn(async () => []),
  downloadCover: vi.fn(async () => undefined),
  preferredCountry: vi.fn(() => undefined),
}));

vi.mock('../services/musicBrainz', () => ({
  searchDeezer: vi.fn(async () => []),
  searchMusicBrainz: vi.fn(async () => []),
}));
beforeEach(() => {
  vi.mocked(searchCatalogue).mockClear();
  vi.mocked(searchDeezer).mockReset().mockResolvedValue([]);
  vi.mocked(searchMusicBrainz).mockReset().mockResolvedValue([]);
});

const bare = (id: string, overrides = {}) =>
  makeTrack({ id, title: `Song ${id}`, artwork: undefined, year: undefined, ...overrides });

describe('deciding which songs to ask about', () => {
  it('skips songs that already know everything', () => {
    const complete = makeTrack({
      id: 'done',
      artwork: 'data:image/jpeg;base64,x',
      year: 2020,
      genres: ['Ambient'],
      trackNumber: 2,
    });
    expect(detailsQueue([complete])).toEqual([]);

    expect(detailsQueue([{ ...complete, trackNumber: undefined }])).toHaveLength(1);
  });

  it('checks complete songs for swapped roles only with separate permission', () => {
    const complete = makeTrack({
      artwork: 'cover',
      year: 2020,
      genres: ['Ambient'],
      trackNumber: 1,
      duration: 214,
    });
    expect(detailsQueue([complete])).toEqual([]);
    expect(detailsQueue([complete], Date.now(), new Set(), true)).toEqual([complete]);
    expect(
      detailsQueue(
        [{ ...complete, rolesReviewed: rolesReviewKey(complete) }],
        Date.now(),
        new Set(),
        true,
      ),
    ).toEqual([]);
    expect(detailsQueue([{ ...complete, editedAt: 1 }], Date.now(), new Set(), true)).toEqual([]);
  });

  it('asks most incomplete first, and never more than a batch at a time', () => {
    const songs = Array.from({ length: DETAILS_BATCH + 6 }, (_, index) => bare(`s${index}`));
    const queue = detailsQueue(songs);
    expect(queue).toHaveLength(DETAILS_BATCH);
    expect(queue[0].id).toBe('s0');
  });

  it('leaves a song alone for a month after asking', () => {
    const asked = { ...bare('asked'), detailsCheckedAt: Date.now() - 1000 };
    expect(detailsQueue([asked])).toEqual([]);
    const stale = { ...bare('stale'), detailsCheckedAt: Date.now() - DETAILS_RETRY_MS - 1 };
    expect(detailsQueue([stale]).map((track) => track.id)).toEqual(['stale']);
  });

  it('counts what is missing for the settings line', () => {
    const complete = makeTrack({
      id: 'ok',
      artwork: 'data:image/jpeg;base64,x',
      year: 2020,
      genres: ['Ambient'],
      trackNumber: 1,
    });
    expect(detailsSummary([complete, bare('gap')])).toEqual({ incomplete: 1, complete: 1 });
  });

  it('is off until the listener turns it on', () => {
    localStorage.removeItem('wave-complete-details');
    expect(detailsEnabled()).toBe(false);
    localStorage.setItem('wave-complete-details', 'on');
    expect(detailsEnabled()).toBe(true);
    localStorage.setItem('wave-complete-details', 'off');
    expect(detailsEnabled()).toBe(false);
    localStorage.removeItem('wave-complete-details');
  });

  it('keeps quiet about the network while it is off', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() =>
        useCatalogueDetails({
          tracks: [bare('gap')],
          onUpdate: vi.fn(async () => null),
          enabled: false,
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(searchCatalogue).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks once the listener turns it on', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() =>
        useCatalogueDetails({
          tracks: [bare('gap')],
          onUpdate: vi.fn(async () => null),
          enabled: true,
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(searchCatalogue).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

it('uses another catalogue when the first has no matching release, only with permission', async () => {
  vi.useFakeTimers();
  try {
    const track = bare('fallback', { title: 'Says', artist: 'Nils Frahm', album: '' });
    vi.mocked(searchDeezer).mockResolvedValue([
      { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', year: 2013, provider: 'Deezer' },
    ]);
    const update = vi.fn(async () => track);
    renderHook(() => useCatalogueDetails({ tracks: [track], onUpdate: update, enabled: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(searchDeezer).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      track.id,
      expect.objectContaining({ album: 'Spaces' }),
      track,
    );
  } finally {
    vi.useRealTimers();
  }
});

it('cancels an in-flight lookup when permission is turned off and saves nothing late', async () => {
  vi.useFakeTimers();
  try {
    const track = bare('cancel', { title: 'Says', artist: 'Nils Frahm' });
    let finish!: (value: Awaited<ReturnType<typeof searchCatalogue>>) => void;
    vi.mocked(searchCatalogue).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const update = vi.fn(async () => track);
    const { rerender } = renderHook(
      ({ enabled }) => useCatalogueDetails({ tracks: [track], onUpdate: update, enabled }),
      { initialProps: { enabled: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const signal = vi.mocked(searchCatalogue).mock.calls[0][1]?.signal;
    rerender({ enabled: false });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish([{ title: 'Says', artist: 'Nils Frahm', album: 'Spaces', year: 2013 }]);
      await Promise.resolve();
    });
    expect(update).not.toHaveBeenCalled();
    expect(searchDeezer).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('continues beyond the first batch even when no track is updated', async () => {
  vi.useFakeTimers();
  try {
    const tracks = Array.from({ length: DETAILS_BATCH + 3 }, (_, i) => bare(`batch-${i}`));
    const update = vi.fn(async () => null);
    const { unmount } = renderHook(() =>
      useCatalogueDetails({ tracks, onUpdate: update, enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    const queries = vi.mocked(searchDeezer).mock.calls.map(([query]) => query);
    expect(queries).toHaveLength(tracks.length);
    expect(update).not.toHaveBeenCalled();
    unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('does not retry a failing provider forever in the same session', async () => {
  vi.useFakeTimers();
  try {
    const tracks = [bare('unreachable')];
    vi.mocked(searchCatalogue).mockRejectedValueOnce(new Error('offline'));
    const { unmount } = renderHook(() =>
      useCatalogueDetails({ tracks, onUpdate: vi.fn(async () => null), enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(searchCatalogue).toHaveBeenCalledTimes(1);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('consults MusicBrainz and Deezer on an Apple match only with separate comparison consent', async () => {
  vi.useFakeTimers();
  try {
    const track = bare('compare', { title: 'Says', artist: 'Nils Frahm', album: '' });
    const match = { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', year: 2013 };
    vi.mocked(searchCatalogue).mockResolvedValue([match]);
    const update = vi.fn(async () => track);
    const ordinary = renderHook(() =>
      useCatalogueDetails({ tracks: [track], onUpdate: update, enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(searchDeezer).not.toHaveBeenCalled();
    expect(searchMusicBrainz).not.toHaveBeenCalled();
    ordinary.unmount();
    const compare = renderHook(() =>
      useCatalogueDetails({
        tracks: [track],
        onUpdate: update,
        enabled: true,
        contrastCatalogues: true,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(searchDeezer).toHaveBeenCalledOnce();
    expect(searchMusicBrainz).toHaveBeenCalledOnce();
    compare.unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('does not swap artist and title when the catalogues disagree about their orientation', async () => {
  vi.useFakeTimers();
  try {
    const track = bare('disagree', {
      title: 'Nils Frahm',
      artist: 'Says',
      album: '',
      duration: 90,
    });
    vi.mocked(searchCatalogue).mockResolvedValue([
      { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', duration: 90 },
    ]);
    vi.mocked(searchMusicBrainz).mockResolvedValue([
      {
        title: 'Nils Frahm',
        artist: 'Says',
        album: 'Other',
        duration: 90,
        provider: 'MusicBrainz',
      },
    ]);
    const update = vi.fn<
      (id: string, patch: Record<string, unknown>, expected: Track) => Promise<Track>
    >(async () => track);
    const view = renderHook(() =>
      useCatalogueDetails({
        tracks: [track],
        onUpdate: update,
        enabled: true,
        contrastCatalogues: true,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    for (const [, patch] of update.mock.calls) {
      expect(patch).not.toHaveProperty('title', 'Says');
      expect(patch).not.toHaveProperty('artist', 'Nils Frahm');
    }
    expect(searchMusicBrainz).toHaveBeenCalledOnce();
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('cancels comparison work when its separate permission is withdrawn', async () => {
  vi.useFakeTimers();
  try {
    const track = bare('cancel-comparison', { title: 'Says', artist: 'Nils Frahm' });
    vi.mocked(searchCatalogue).mockResolvedValue([
      { title: 'Says', artist: 'Nils Frahm', album: 'Spaces' },
    ]);
    let finish!: (value: Awaited<ReturnType<typeof searchMusicBrainz>>) => void;
    vi.mocked(searchMusicBrainz).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const update = vi.fn(async () => track);
    const view = renderHook(
      ({ contrastCatalogues }) =>
        useCatalogueDetails({
          tracks: [track],
          onUpdate: update,
          enabled: true,
          contrastCatalogues,
        }),
      { initialProps: { contrastCatalogues: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const signal = vi.mocked(searchMusicBrainz).mock.calls[0][1];
    view.rerender({ contrastCatalogues: false });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish([]);
      await Promise.resolve();
    });
    expect(update).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps conflicting album, year, genre and cover out of automatic updates', async () => {
  vi.useFakeTimers();
  try {
    const track = bare('conflicting-details', {
      title: 'Says',
      artist: 'Nils Frahm',
      album: '',
      fileName: 'Says.wav',
      duration: 90,
    });
    vi.mocked(searchCatalogue).mockResolvedValue([
      {
        title: 'Says',
        artist: 'Nils Frahm',
        album: 'Spaces',
        year: 2013,
        genre: 'Ambient',
        duration: 90,
        artworkUrl: 'https://example.com/cover.jpg',
      },
    ]);
    vi.mocked(searchMusicBrainz).mockResolvedValue([
      {
        title: 'Says',
        artist: 'Nils Frahm',
        album: 'Different release',
        year: 2014,
        genre: 'Classical',
        duration: 90,
        provider: 'MusicBrainz',
      },
    ]);
    const update = vi.fn<
      (id: string, patch: Record<string, unknown>, expected: Track) => Promise<Track>
    >(async () => track);
    const view = renderHook(() =>
      useCatalogueDetails({
        tracks: [track],
        onUpdate: update,
        enabled: true,
        contrastCatalogues: true,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(searchMusicBrainz).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});
