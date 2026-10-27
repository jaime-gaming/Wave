import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from './useLibrary';
import {
  getTracks,
  saveTrack,
  deleteTrack,
  toggleTrackFavorite,
  editTrackMetadata,
  restoreTrackMetadata,
  recordContentHash,
} from '../data/library';
import { readTrack } from '../data/import';
import { makeTrack } from '../test/fixtures';

vi.mock('../data/library', () => ({
  getTracks: vi.fn(),
  saveTrack: vi.fn(),
  deleteTrack: vi.fn(),
  toggleTrackFavorite: vi.fn(),
  getPlaylists: vi.fn().mockResolvedValue([]),
  editTrackMetadata: vi.fn(),
  restoreTrackMetadata: vi.fn(),
  recordContentHash: vi.fn(),
  saveLyricsResult: vi.fn(),
  saveTrackLyrics: vi.fn(),
}));
vi.mock('../data/import', async (original) => ({
  ...(await original<typeof import('../data/import')>()),
  readTrack: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(getTracks).mockResolvedValue([]);
  vi.mocked(saveTrack).mockResolvedValue(undefined);
  vi.mocked(deleteTrack).mockResolvedValue(undefined);
  vi.mocked(toggleTrackFavorite).mockImplementation(async (id) =>
    makeTrack({ id, favorite: true }),
  );
  vi.mocked(readTrack).mockImplementation(async (file, id) => makeTrack({ id, blob: file }));
});
describe('library workflow', () => {
  it('imports a file once and reports duplicate and unsupported files', async () => {
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const file = new File(['music'], 'Signal.wav', { lastModified: 1 });
    await act(async () => {
      await result.current.importFiles([file, file, new File(['x'], 'notes.txt')]);
    });
    expect(result.current.tracks).toHaveLength(1);
    expect(saveTrack).toHaveBeenCalledTimes(1);
    expect(result.current.message).toContain('1 already');
    expect(result.current.message).toContain('1 skipped (MP3, WAV, M4A or OGG, up to 200 MB)');
    expect(result.current.progress).toBeNull();
  });
  it('keeps successful imports when a later write fails', async () => {
    vi.mocked(saveTrack).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importFiles([new File(['x'], 'a.wav'), new File(['y'], 'b.wav')]);
    });
    expect(result.current.tracks).toHaveLength(1);
    expect(result.current.error).toContain('storage');
    expect(result.current.progress).toBeNull();
  });
  it('reports initialization errors instead of hanging', async () => {
    vi.mocked(getTracks).mockRejectedValueOnce(new Error('blocked'));
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('could not be opened');
  });
  it('does not change favorites or remove a track after a failed write', async () => {
    const track = makeTrack();
    vi.mocked(getTracks).mockResolvedValue([track]);
    vi.mocked(saveTrack).mockRejectedValue(new Error('quota'));
    vi.mocked(toggleTrackFavorite).mockRejectedValue(new Error('quota'));
    vi.mocked(deleteTrack).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.toggleFavorite(track);
    });
    expect(result.current.tracks[0].favorite).toBe(false);
    await act(async () => {
      expect(await result.current.remove(track.id)).toBe(false);
    });
    expect(result.current.tracks).toHaveLength(1);
  });
  it('preserves the active Blob across favorite, edit, and restore updates', async () => {
    const track = makeTrack();
    const freshBlob = new Blob(['another structured clone']);
    vi.mocked(getTracks).mockResolvedValue([track]);
    vi.mocked(toggleTrackFavorite).mockResolvedValue({ ...track, favorite: true, blob: freshBlob });
    vi.mocked(editTrackMetadata).mockResolvedValue({
      ...track,
      title: 'Custom title',
      favorite: true,
      blob: freshBlob,
    });
    vi.mocked(restoreTrackMetadata).mockResolvedValue({
      ...track,
      favorite: true,
      blob: freshBlob,
    });
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.toggleFavorite(track);
    });
    expect(result.current.tracks[0].blob).toBe(track.blob);
    await act(async () => {
      expect(
        await result.current.editMetadata(track.id, {
          title: 'Custom title',
          artist: track.artist,
          album: track.album,
        }),
      ).toBe(true);
    });
    expect(result.current.tracks[0].title).toBe('Custom title');
    expect(result.current.tracks[0].favorite).toBe(true);
    expect(result.current.tracks[0].blob).toBe(track.blob);
    await act(async () => {
      expect(await result.current.restoreMetadata(track.id)).toBe(true);
    });
    expect(result.current.tracks[0].title).toBe(track.title);
    expect(result.current.tracks[0].blob).toBe(track.blob);
  });
  it('retains saved metadata when editing or restoration fails', async () => {
    const track = makeTrack();
    vi.mocked(getTracks).mockResolvedValue([track]);
    vi.mocked(editTrackMetadata).mockRejectedValue(new Error('quota'));
    vi.mocked(restoreTrackMetadata).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(
        await result.current.editMetadata(track.id, { title: 'Custom', artist: '', album: '' }),
      ).toBe(false);
    });
    expect(result.current.tracks[0]).toBe(track);
    await act(async () => {
      expect(await result.current.restoreMetadata(track.id)).toBe(false);
    });
    expect(result.current.tracks[0]).toBe(track);
  });
});

it('deduplicates legacy bytes without changing IDs and permits removal/reimport', async () => {
  const old = makeTrack({ id: 'legacy', blob: new File(['music'], 'old.wav'), size: 5 });
  vi.mocked(getTracks).mockResolvedValue([old]);
  vi.mocked(recordContentHash).mockResolvedValue(old);
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.importFiles([new File(['music'], 'renamed.wav')]));
  expect(result.current.tracks.map((track) => track.id)).toEqual(['legacy']);
  expect(recordContentHash).toHaveBeenCalledWith('legacy', expect.any(String));
  expect(saveTrack).not.toHaveBeenCalled();
  await act(() => result.current.remove('legacy'));
  await act(() => result.current.importFiles([new File(['music'], 'again.wav')]));
  expect(result.current.tracks).toHaveLength(1);
  expect(result.current.tracks[0].id).not.toBe('legacy');
  expect(saveTrack).toHaveBeenCalledOnce();
});
