import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaylists } from './usePlaylists';
import { getPlaylists, createPlaylist, updatePlaylist, deletePlaylist } from '../data/library';
import type { Playlist } from '../domain/types';

vi.mock('../data/library', () => ({
  getPlaylists: vi.fn(),
  createPlaylist: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
}));
const saved: Playlist = {
  id: 'morning',
  name: 'Morning',
  description: '',
  trackIds: ['one', 'two'],
  createdAt: 1,
  updatedAt: 1,
};
beforeEach(() => {
  vi.mocked(getPlaylists).mockResolvedValue([saved]);
  vi.mocked(createPlaylist).mockResolvedValue({
    ...saved,
    id: 'evening',
    name: 'Evening',
    trackIds: [],
  });
  vi.mocked(updatePlaylist).mockResolvedValue({ ...saved, trackIds: ['two', 'one'] });
  vi.mocked(deletePlaylist).mockResolvedValue(undefined);
});
describe('playlist workflow', () => {
  it('loads, creates, moves, prunes committed deletions, and removes collections', async () => {
    const { result } = renderHook(usePlaylists);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect((await result.current.create({ name: 'Evening', description: '' }))?.id).toBe(
        'evening',
      );
      expect(
        await result.current.update('morning', { type: 'move', id: 'two', direction: -1 }),
      ).toBe(true);
    });
    expect(result.current.playlists[0].trackIds).toEqual(['two', 'one']);
    act(() => result.current.pruneTrack('one'));
    expect(result.current.playlists[0].trackIds).toEqual(['two']);
    await act(async () => {
      expect(await result.current.remove('morning')).toBe(true);
    });
    expect(result.current.playlists.map((playlist) => playlist.id)).toEqual(['evening']);
  });
  it('does not invent a playlist when creation fails', async () => {
    vi.mocked(createPlaylist).mockRejectedValue(new Error('quota'));
    const { result } = renderHook(usePlaylists);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.create({ name: 'Evening', description: '' })).toBeNull();
    });
    expect(result.current.playlists).toEqual([saved]);
    expect(result.current.error).toContain('could not be created');
  });
  it('preserves saved membership and the playlist after failed update/deletion', async () => {
    vi.mocked(updatePlaylist).mockRejectedValue(new Error('quota'));
    vi.mocked(deletePlaylist).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(usePlaylists);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.update(saved.id, { type: 'remove', id: 'one' })).toBe(false);
    });
    expect(result.current.playlists).toEqual([saved]);
    await act(async () => {
      expect(await result.current.remove(saved.id)).toBe(false);
    });
    expect(result.current.playlists).toEqual([saved]);
    expect(result.current.error).toContain('could not be deleted');
  });
  it('reports unavailable storage and finishes the loading state', async () => {
    vi.mocked(getPlaylists).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(usePlaylists);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('could not be opened');
    expect(result.current.playlists).toEqual([]);
  });
});
