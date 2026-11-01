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
import { makeTrack } from '../test/fixtures';

vi.mock('../services/catalogue', () => ({
  searchCatalogue: vi.fn(async () => []),
  downloadCover: vi.fn(async () => undefined),
  preferredCountry: vi.fn(() => undefined),
}));

beforeEach(() => vi.mocked(searchCatalogue).mockClear());

const bare = (id: string, overrides = {}) =>
  makeTrack({ id, title: `Song ${id}`, artwork: undefined, year: undefined, ...overrides });

describe('deciding which songs to ask about', () => {
  it('skips songs that already know everything', () => {
    const complete = makeTrack({
      id: 'done',
      artwork: 'data:image/jpeg;base64,x',
      year: 2020,
      genres: ['Ambient'],
    });
    expect(detailsQueue([complete])).toEqual([]);
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
