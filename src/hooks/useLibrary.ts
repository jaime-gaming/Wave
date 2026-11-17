import type { VolumeFix } from '../audio/volumeFix';
import { setTrackVolumeFix } from '../data/library';
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
  reviewTrackRoles,
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
import { parseYouTubeLink } from '../domain/youtube';
import { youtubeTrack } from '../domain/youtubeTrack';
import { fetchVideoMeta, fetchYouTubePlaylist } from '../services/videoMeta';
import type { Track, TrackMetadata } from '../domain/types';

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    fileName?: string;
    added?: number;
  } | null>(null);
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
      const pending: Track[] = [];
      let lastPublish = performance.now();
      const publish = () => {
        if (!pending.length) return;
        const batch = pending.splice(0);
        startTransition(() => setTracks((current) => [...current, ...batch]));
        lastPublish = performance.now();
      };
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
                pending.push(prepared.track);
                if (pending.length >= 8 || performance.now() - lastPublish >= 250) publish();
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
          setProgress({ done: index + 1, total: files.length, fileName: file.name, added });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        outOfSpace = true;
      } finally {
        publish();
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
   * Adds a song or public playlist that lives on YouTube. Nothing is downloaded:
   * each record stores the video id and the official embed plays it. Metadata
   * comes from Wave's same-origin `/api/youtube-meta` / `/api/youtube-playlist`
   * endpoint first (CORS-free) and falls back to public providers.
   */
  const addYouTube = useCallback(
    async (
      link: string,
      prefilled?: { title?: string; artist?: string; duration?: number; thumbnail?: string },
    ): Promise<{ ok: true; track: Track; added?: number } | { ok: false; error: string }> => {
      const parsed = parseYouTubeLink(link);
      if (!parsed) {
        return {
          ok: false,
          error: 'Paste a valid YouTube song or public playlist link.',
        };
      }
      setMessage('');
      setError('');

      if (parsed.kind === 'playlist') {
        const playlist = await fetchYouTubePlaylist(parsed.playlistId);
        if (!playlist || !playlist.videos.length) {
          return {
            ok: false,
            error:
              'That YouTube playlist could not be read. Make sure it is public or unlisted and try again.',
          };
        }
        const addedTracks: Track[] = [];
        let skipped = 0;
        for (const entry of playlist.videos) {
          const id = `yt-${entry.videoId}`;
          if (existing.current.some((t) => t.id === id || t.videoId === entry.videoId)) {
            skipped++;
            continue;
          }
          const track = youtubeTrack(
            {
              videoId: entry.videoId,
              title: entry.title,
              artist: entry.artist,
              duration: entry.duration,
              artwork: entry.thumbnail,
            },
            id,
          );
          try {
            await saveTrack(track);
            existing.current = [...existing.current, track];
            addedTracks.push(track);
          } catch {
            break;
          }
        }
        if (!addedTracks.length) {
          return {
            ok: false,
            error:
              skipped > 0
                ? 'All videos from this YouTube playlist are already in your library.'
                : 'These songs could not be saved. Please check browser storage.',
          };
        }
        setTracks((current) => [...current, ...addedTracks]);
        setMessage(
          `Added ${addedTracks.length} ${addedTracks.length === 1 ? 'song' : 'songs'} from YouTube · ${playlist.title}${skipped ? ` (${skipped} already in your library)` : ''}`,
        );
        return { ok: true, track: addedTracks[0], added: addedTracks.length };
      }

      const id = `yt-${parsed.videoId}`;
      if (existing.current.some((track) => track.id === id || track.videoId === parsed.videoId))
        return { ok: false, error: 'This video is already in your library.' };
      const meta = prefilled?.title
        ? {
            title: prefilled.title,
            artist: prefilled.artist ?? '',
            duration: prefilled.duration ?? 0,
            thumbnail: prefilled.thumbnail,
          }
        : await fetchVideoMeta(parsed.videoId);
      const track = youtubeTrack(
        {
          videoId: parsed.videoId,
          title: meta?.title ?? '',
          artist: meta?.artist,
          duration: meta?.duration,
          artwork: meta?.thumbnail,
        },
        id,
      );
      try {
        await saveTrack(track);
        existing.current = [...existing.current, track];
        setTracks((current) => [...current, track]);
        setMessage(`Added from YouTube · ${track.title}`);
        return { ok: true, track, added: 1 };
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
  const resolveRoles = useCallback(async (id: string, action: 'swap' | 'keep') => {
    try {
      const updated = await reviewTrackRoles(id, action);
      setTracks((current) =>
        current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
      );
      return true;
    } catch {
      setError('Song details could not be saved. Please try again.');
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
  const applyVolumeFix = useCallback(async (id: string, correction: VolumeFix) => {
    const updated = await setTrackVolumeFix(id, correction);
    existing.current = existing.current.map((item) =>
      item.id === id ? { ...updated, blob: item.blob } : item,
    );
    setTracks((current) =>
      current.map((item) => (item.id === id ? { ...updated, blob: item.blob } : item)),
    );
  }, []);
  return {
    applyVolumeFix,
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
    resolveRoles,
    restoreMetadata,
    remove,
  };
}
