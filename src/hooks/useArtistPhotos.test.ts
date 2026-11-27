import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useArtistPhotos } from './useArtistPhotos';
import { makeTrack } from '../test/fixtures';
import { searchDeezer } from '../services/musicBrainz';
import { downloadCover } from '../services/catalogue';
import { readArtwork } from '../data/artwork';

vi.mock('../services/musicBrainz', () => ({ searchDeezer: vi.fn() }));
vi.mock('../services/catalogue', () => ({ downloadCover: vi.fn() }));
vi.mock('../data/artwork', () => ({ readArtwork: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it('only saves a matching artist without an existing photo', async () => {
  vi.mocked(searchDeezer).mockResolvedValue([
    {
      title: 'Other',
      artist: 'Someone else',
      album: '',
      provider: 'Deezer',
      artistArtworkUrl: 'https://example.test/wrong.jpg',
    },
    {
      title: 'Song',
      artist: 'New Artist',
      album: '',
      provider: 'Deezer',
      artistArtworkUrl: 'https://example.test/right.jpg',
    },
  ]);
  vi.mocked(downloadCover).mockResolvedValue(new File(['image'], 'cover.jpg'));
  vi.mocked(readArtwork).mockResolvedValue('data:image/jpeg;base64,aW1hZ2U=');
  const save = vi.fn().mockResolvedValue(true);
  const tracks = [makeTrack({ artist: 'Existing' }), makeTrack({ artist: 'New Artist' })];
  const { result } = renderHook(() =>
    useArtistPhotos(tracks, [{ name: 'Existing', artwork: 'already' }], save),
  );
  await act(async () => result.current.find());
  expect(searchDeezer).toHaveBeenCalledTimes(1);
  expect(downloadCover).toHaveBeenCalledWith(
    'https://example.test/right.jpg',
    expect.any(AbortSignal),
  );
  expect(save).toHaveBeenCalledWith('New Artist', 'data:image/jpeg;base64,aW1hZ2U=');
  expect(result.current.progress).toEqual({ done: 1, total: 1, found: 1 });
});

it('does not save a late result after the search is cancelled on unmount', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof searchDeezer>>) => void;
  vi.mocked(searchDeezer).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const save = vi.fn();
  const { result, unmount } = renderHook(() =>
    useArtistPhotos([makeTrack({ artist: 'Artist' })], [], save),
  );
  let search!: Promise<void>;
  act(() => {
    search = result.current.find();
  });
  await waitFor(() => expect(searchDeezer).toHaveBeenCalled());
  unmount();
  await act(async () => {
    resolve([
      {
        title: 'Song',
        artist: 'Artist',
        album: '',
        provider: 'Deezer',
        artistArtworkUrl: 'https://example.test/photo.jpg',
      },
    ]);
    await search;
  });
  expect(downloadCover).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
