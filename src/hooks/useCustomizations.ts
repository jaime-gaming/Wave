import { useCallback, useEffect, useState } from 'react';
import { getCustomizations, saveAlbumOrder, saveArtistProfile } from '../data/library';
import type { AlbumOrder, ArtistProfile } from '../domain/types';
export function useCustomizations() {
  const [artists, setArtists] = useState<ArtistProfile[]>([]),
    [albums, setAlbums] = useState<AlbumOrder[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getCustomizations()
      .then((saved) => {
        if (active) {
          setArtists(saved.artists);
          setAlbums(saved.albums);
        }
      })
      .catch(() => {
        if (active) setError('Artist photos and album orders could not be opened.');
      });
    return () => {
      active = false;
    };
  }, []);
  const saveArtist = useCallback(async (profile: ArtistProfile) => {
    try {
      const saved = await saveArtistProfile(profile);
      setArtists((current) => [...current.filter((item) => item.name !== saved.name), saved]);
      return true;
    } catch {
      setError('Artist photo could not be saved.');
      return false;
    }
  }, []);
  const saveOrder = useCallback(async (id: string, ids: string[]) => {
    try {
      const saved = await saveAlbumOrder(id, ids);
      setAlbums((current) => [...current.filter((item) => item.id !== id), saved]);
      return true;
    } catch {
      setError('Album order could not be saved. The album may have changed.');
      return false;
    }
  }, []);
  const reload = useCallback(async () => {
    const saved = await getCustomizations();
    setArtists(saved.artists);
    setAlbums(saved.albums);
  }, []);
  return { reload, artists, albums, error, setError, saveArtist, saveOrder };
}
