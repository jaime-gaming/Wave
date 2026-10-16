import { requestPersistentStorage } from '../data/storage';
import type { LyricsResult } from '../services/lyrics';
import type { Lyrics } from '../domain/lyrics';
import {
  recordContentHash,
  recordDecodedDuration,
  saveLyricsResult,
  saveTrackLyrics,
} from '../data/library';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteTrack,
  getTracks,
  saveTrack,
  toggleTrackFavorite,
  editTrackMetadata,
  restoreTrackMetadata,
} from '../data/library';
import { contentIdentity, isAudioFile, MAX_FILE_SIZE, readTrack } from '../data/import';
import type { Track, TrackMetadata } from '../domain/types';

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const importing = useRef(false);
  const known = useRef(new Set<string>());
  const existing = useRef<Track[]>([]);
  useEffect(() => {
    let active = true;
    getTracks()
      .then((saved) => {
        if (active) {
          existing.current = [...saved];
          known.current = new Set(
            saved.flatMap((track) => (track.contentHash ? [track.contentHash] : [])),
          );
          setTracks(saved);
        }
      })
      .catch(() => {
        if (active)
          setError('Your library could not be opened. Enable browser storage and reload.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const importFiles = useCallback(
    async (files: File[]) => {
      if (importing.current || loading || !files.length) return;
      importing.current = true;
      void requestPersistentStorage();
      setError('');
      setMessage('');
      let added = 0,
        duplicates = 0,
        rejected = 0;
      setProgress({ done: 0, total: files.length });
      try {
        for (const [index, file] of files.entries()) {
          if (!isAudioFile(file) || file.size > MAX_FILE_SIZE || file.size === 0) {
            rejected++;
          } else {
            const id = await contentIdentity(file);
            for (const old of existing.current.filter(
              (track) => !track.contentHash && track.size === file.size,
            )) {
              const hash = await contentIdentity(old.blob);
              await recordContentHash(old.id, hash);
              known.current.add(hash);
              existing.current = existing.current.map((track) =>
                track.id === old.id ? { ...track, contentHash: hash } : track,
              );
            }
            if (known.current.has(id)) {
              duplicates++;
            } else {
              const track = { ...(await readTrack(file, id)), contentHash: id };
              await saveTrack(track);
              known.current.add(id);
              existing.current = [...existing.current, track];
              startTransition(() => setTracks((current) => [...current, track]));
              added++;
            }
          }
          setProgress({ done: index + 1, total: files.length });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        setError(
          'Import stopped: browser storage is unavailable or full. Files already added are safe.',
        );
      } finally {
        setMessage(
          `${added} ${added === 1 ? 'track' : 'tracks'} added${duplicates ? ` · ${duplicates} already in your library` : ''}${rejected ? ` · ${rejected} unsupported, empty, or over 200 MB` : ''}.`,
        );
        setProgress(null);
        importing.current = false;
      }
    },
    [loading],
  );

  const toggleFavorite = useCallback(async (track: Track) => {
    try {
      const updated = await toggleTrackFavorite(track.id);
      setTracks((current) =>
        current.map((item) => (item.id === track.id ? { ...updated, blob: item.blob } : item)),
      );
    } catch {
      setError('Your favorite could not be saved. Please check browser storage.');
    }
  }, []);
  const remove = useCallback(async (id: string) => {
    try {
      await deleteTrack(id);
      const deleted = existing.current.find((track) => track.id === id);
      if (deleted?.contentHash) known.current.delete(deleted.contentHash);
      existing.current = existing.current.filter((track) => track.id !== id);
      setTracks((current) => current.filter((track) => track.id !== id));
      return true;
    } catch {
      setError('This track could not be removed. Please try again.');
      return false;
    }
  }, []);
  const editMetadata = useCallback(async (id: string, metadata: TrackMetadata) => {
    try {
      const updated = await editTrackMetadata(id, metadata);
      setTracks((current) =>
        current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
      );
      return true;
    } catch {
      setError('Song information could not be saved. Check the fields and browser storage.');
      return false;
    }
  }, []);
  const restoreMetadata = useCallback(async (id: string) => {
    try {
      const updated = await restoreTrackMetadata(id);
      setTracks((current) =>
        current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
      );
      return true;
    } catch {
      setError('Original song information could not be restored.');
      return false;
    }
  }, []);
  const saveLyrics = useCallback(async (id: string, lyrics?: Lyrics) => {
    try {
      const updated = await saveTrackLyrics(id, lyrics);
      setTracks((current) =>
        current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
      );
      return true;
    } catch {
      setError('Lyrics could not be saved. Check the file and browser storage.');
      return false;
    }
  }, []);
  const acceptDuration = useCallback(async (id: string, duration: number) => {
    try {
      const updated = await recordDecodedDuration(id, duration);
      setTracks((current) =>
        current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
      );
    } catch {
      /* A removed track or blocked storage cannot interrupt listening. */
    }
  }, []);
  const acceptLyrics = useCallback(async (id: string, result: LyricsResult) => {
    const updated = await saveLyricsResult(id, result);
    setTracks((current) =>
      current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
    );
  }, []);
  const reload = useCallback(async () => {
    const saved = await getTracks();
    setTracks((current) =>
      saved.map((track) => ({
        ...track,
        blob: current.find((item) => item.id === track.id)?.blob ?? track.blob,
      })),
    );
    existing.current = [...saved];
    known.current = new Set(
      saved.flatMap((track) => (track.contentHash ? [track.contentHash] : [])),
    );
  }, []);
  return {
    reload,
    acceptLyrics,
    acceptDuration,
    saveLyrics,
    tracks,
    loading,
    progress,
    message,
    error,
    setError,
    importFiles,
    toggleFavorite,
    editMetadata,
    restoreMetadata,
    remove,
  };
}
