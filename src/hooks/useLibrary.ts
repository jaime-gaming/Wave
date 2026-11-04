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
  applyOnlineDetails,
  deleteTrack,
  getTracks,
  saveTrack,
  toggleTrackFavorite,
  editTrackMetadata,
  restoreTrackMetadata,
  recordTrackSilence,
  trimTrackSilence,
  restoreTrackSilence,
  keepTrackSilence,
} from '../data/library';
import {
  contentIdentity,
  IMPORT_FORMAT_HINT,
  isAudioFile,
  isLegacyAudioFile,
  MAX_FILE_SIZE,
  readTrack,
} from '../data/import';
import { youtubeTrack, youTubeVideoOf } from '../domain/youtubeTrack';
import { fetchVideoMeta } from '../services/videoMeta';
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
        rejected = 0,
        wrongFormat = 0,
        failed = 0,
        outOfSpace = false;
      setProgress({ done: 0, total: files.length });
      try {
        for (const [index, file] of files.entries()) {
          // One unreadable file is one file. A folder of a thousand songs is not
          // a curated set, and a single odd tag, a truncated download or a codec
          // this browser cannot read must not end the import of the other 999.
          if (!isAudioFile(file) || file.size > MAX_FILE_SIZE || file.size === 0) {
            if (isLegacyAudioFile(file)) wrongFormat++;
            rejected++;
          } else {
            // Reading a file can fail on the file; writing one can only fail on
            // the library, so the two are handled apart.
            let prepared: { id: string; track?: Track } | undefined;
            try {
              const id = await contentIdentity(file);
              for (const old of existing.current.filter(
                (track) => !track.contentHash && track.blob && track.size === file.size,
              )) {
                const hash = await contentIdentity(old.blob!);
                recordContentHash(old.id, hash).catch(() => undefined);
                known.current.add(hash);
                existing.current = existing.current.map((track) =>
                  track.id === old.id ? { ...track, contentHash: hash } : track,
                );
              }
              prepared = known.current.has(id)
                ? { id }
                : { id, track: { ...(await readTrack(file, id)), contentHash: id } };
            } catch {
              failed++;
            }
            if (prepared?.track) {
              try {
                await saveTrack(prepared.track);
                known.current.add(prepared.id);
                existing.current = [...existing.current, prepared.track];
                startTransition(() => setTracks((current) => [...current, prepared!.track!]));
                added++;
              } catch {
                // Storage is the one failure that cannot be skipped past: stop
                // cleanly, say so, and leave what was already saved in place.
                outOfSpace = true;
                break;
              }
            } else if (prepared) {
              duplicates++;
            }
          }
          setProgress({ done: index + 1, total: files.length });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        outOfSpace = true;
      } finally {
        if (outOfSpace)
          setError(
            'Import stopped: browser storage is unavailable or full. Files already added are safe.',
          );
        setMessage(
          `${added} ${added === 1 ? 'track' : 'tracks'} added${duplicates ? ` · ${duplicates} already in your library` : ''}${rejected ? ` · ${rejected} skipped (${IMPORT_FORMAT_HINT}, up to 200 MB)` : ''}${failed ? ` · ${failed} could not be read` : ''}${wrongFormat ? ` · ${wrongFormat} in a format Wave no longer imports` : ''}.`,
        );
        setProgress(null);
        importing.current = false;
      }
    },
    [loading],
  );

  /**
   * Adds a song that lives on YouTube. The video is never downloaded: the record
   * stores the video id and the official embed plays it. Title and artist come
   * from YouTube's oEmbed endpoint when it answers, and stay editable.
   */
  const addYouTube = useCallback(
    async (link: string): Promise<{ ok: true; track: Track } | { ok: false; error: string }> => {
      const video = youTubeVideoOf(link);
      if (!video)
        return {
          ok: false,
          error: 'Paste a YouTube video link. Playlists and channels are not songs.',
        };
      const id = `yt-${video.videoId}`;
      if (existing.current.some((track) => track.id === id || track.videoId === video.videoId))
        return { ok: false, error: 'This video is already in your library.' };
      setMessage('');
      setError('');
      const meta = await fetchVideoMeta(video.videoId);
      const track = youtubeTrack(
        {
          videoId: video.videoId,
          title: meta?.title ?? '',
          artist: meta?.artist,
          duration: meta?.duration,
        },
        id,
      );
      try {
        await saveTrack(track);
        existing.current = [...existing.current, track];
        setTracks((current) => [...current, track]);
        setMessage(`Added from YouTube · ${track.title}`);
        return { ok: true, track };
      } catch {
        setError('This song could not be saved. Please check browser storage.');
        return { ok: false, error: 'This song could not be saved.' };
      }
    },
    [],
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
  /** Silent edges: measured, removed, restored or kept, never re-encoded. */
  const silence = useCallback(
    async (
      id: string,
      action: 'record' | 'trim' | 'restore' | 'keep',
      bounds?: { start: number; end: number },
    ) => {
      const apply = () =>
        action === 'record' && bounds
          ? recordTrackSilence(id, bounds)
          : action === 'trim' && bounds
            ? trimTrackSilence(id, bounds)
            : action === 'restore'
              ? restoreTrackSilence(id)
              : keepTrackSilence(id);
      try {
        const updated = await apply();
        setTracks((current) =>
          current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
        );
      } catch {
        /* A removed track or blocked storage cannot interrupt listening. */
      }
    },
    [],
  );
  const acceptLyrics = useCallback(async (id: string, result: LyricsResult) => {
    const updated = await saveLyricsResult(id, result);
    setTracks((current) =>
      current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
    );
  }, []);
  /** Writes what the online catalogue filled in, and hands back the new song. */
  const applyDetails = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const updated = await applyOnlineDetails(
      id,
      patch as Parameters<typeof applyOnlineDetails>[1],
      { checked: true },
    );
    if (updated)
      setTracks((current) =>
        current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
      );
    return updated;
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
    applyDetails,
    acceptLyrics,
    acceptDuration,
    silence,
    saveLyrics,
    tracks,
    loading,
    progress,
    message,
    error,
    setError,
    importFiles,
    addYouTube,
    toggleFavorite,
    editMetadata,
    restoreMetadata,
    remove,
  };
}
