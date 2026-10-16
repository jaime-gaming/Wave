import { useCallback, useEffect, useState } from 'react';
import { createPlaylist, deletePlaylist, getPlaylists, updatePlaylist } from '../data/library';
import type { Playlist } from '../domain/types';
import type { PlaylistChange, PlaylistDetails } from '../domain/playlists';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getPlaylists()
      .then((saved) => {
        if (active) setPlaylists(saved);
      })
      .catch(() => {
        if (active) setError('Your playlists could not be opened. Check browser storage.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const create = useCallback(async (details: PlaylistDetails, trackIds: string[] = []) => {
    try {
      const saved = await createPlaylist(details, trackIds);
      setPlaylists((current) => [...current, saved]);
      return saved;
    } catch {
      setError('This playlist could not be created. Check the name and browser storage.');
      return null;
    }
  }, []);
  const update = useCallback(async (id: string, change: PlaylistChange) => {
    try {
      const saved = await updatePlaylist(id, change);
      setPlaylists((current) => current.map((playlist) => (playlist.id === id ? saved : playlist)));
      return true;
    } catch {
      setError('This playlist could not be saved. Please try again.');
      return false;
    }
  }, []);
  const remove = useCallback(async (id: string) => {
    try {
      await deletePlaylist(id);
      setPlaylists((current) => current.filter((playlist) => playlist.id !== id));
      return true;
    } catch {
      setError('This playlist could not be deleted. Please try again.');
      return false;
    }
  }, []);
  const pruneTrack = useCallback((id: string) => {
    setPlaylists((current) =>
      current.map((playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((key) => key !== id),
      })),
    );
  }, []);
  const reload = useCallback(async () => setPlaylists(await getPlaylists()), []);
  return { reload, playlists, loading, error, setError, create, update, remove, pruneTrack };
}
