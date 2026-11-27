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
  mergeYouTubeLocalFile,
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
import { youtubeTrack, youtubeMergeTarget } from '../domain/youtubeTrack';
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
        merged = 0,
        duplicates = 0,
        rejected = 0,
        wrongFormat = 0,
        failed = 0,
        outOfSpace = false;

      const legacyBySize = new Map<number, Track[]>();
      for (const track of existing.current) {
        if (!track.contentHash && track.blob) {
          const matches = legacyBySize.get(track.size) ?? [];
          matches.push(track);
          legacyBySize.set(track.size, matches);
        }
      }
      const pending: Track[] = [];
      let lastPublish = performance.now();
      const publish = () => {
        if (!pending.length) return;
        const batch = pending.splice(0);
        startTransition(() =>
          setTracks((current) => {
            const updates = new Map(batch.map((track) => [track.id, track]));
            const retained = current.map((track) => updates.get(track.id) ?? track);
            const currentIds = new Set(current.map((track) => track.id));
            return [...retained, ...batch.filter((track) => !currentIds.has(track.id))];
          }),
        );
        lastPublish = performance.now();
      };
      setProgress({ done: 0, total: files.length });
      try {
        for (const [index, file] of files.entries()) {
          if (!isAudioFile(file) || file.size > MAX_FILE_SIZE || file.size === 0) {
            if (isLegacyAudioFile(file)) wrongFormat++;
            rejected++;
          } else {
            let prepared: { id: string; track?: Track } | undefined;
            try {
              const id = await contentIdentity(file);
              const legacy = legacyBySize.get(file.size) ?? [];
              for (const old of legacy) {
                const hash = await contentIdentity(old.blob!);
                recordContentHash(old.id, hash).catch(() => undefined);
                known.current.add(hash);
                const index = existing.current.findIndex((track) => track.id === old.id);
                if (index !== -1)
                  existing.current[index] = { ...existing.current[index], contentHash: hash };
              }
              legacyBySize.delete(file.size);
              prepared = known.current.has(id)
                ? { id }
                : { id, track: { ...(await readTrack(file, id)), contentHash: id } };
            } catch {
              failed++;
            }
            if (prepared?.track) {
              try {
                const target = youtubeMergeTarget(prepared.track, existing.current);
                const combined = target
                  ? await mergeYouTubeLocalFile(target.id, prepared.track)
                  : null;
                const saved = combined ?? prepared.track;
                if (!combined) await saveTrack(saved);
                known.current.add(prepared.id);
                if (combined) {
                  existing.current = existing.current.map((track) =>
                    track.id === combined.id ? saved : track,
                  );
                  merged++;
                } else existing.current.push(saved);
                pending.push(saved);
                if (pending.length >= 8 || performance.now() - lastPublish >= 250) publish();
                added++;
              } catch {
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
          `${added} ${added === 1 ? 'track' : 'tracks'} added${merged ? ` · ${merged} linked to a YouTube song` : ''}${duplicates ? ` · ${duplicates} already in your library` : ''}${rejected ? ` · ${rejected} skipped (${IMPORT_FORMAT_HINT}, up to 200 MB)` : ''}${failed ? ` · ${failed} could not be read` : ''}${wrongFormat ? ` · ${wrongFormat} in a format Wave no longer imports` : ''}.`,
        );
        setProgress(null);
        importing.current = false;
      }
      return { added, duplicates };
    },
    [loading],
  );

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
        let storageFailed = false;
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
            storageFailed = true;
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
        if (storageFailed)
          setError(
            'Import stopped: browser storage is unavailable or full. Files already added are safe.',
          );
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

  const addPlaylistVideo = useCallback(
    async (video: {
      videoId: string;
      title: string;
      artist: string;
      duration: number;
      thumbnail: string;
    }): Promise<Track | null> => {
      if (!parseYouTubeLink(`https://youtu.be/${video.videoId}`)) return null;
      const id = `yt-playlist-${video.videoId}`;
      const saved = existing.current.find(
        (track) => track.id === id || track.videoId === video.videoId,
      );
      if (saved) return saved;
      const track = {
        ...youtubeTrack({ ...video, artwork: video.thumbnail }, id),
        youtubeOnly: true,
      };
      try {
        await saveTrack(track);
        existing.current = [...existing.current, track];
        setTracks((current) =>
          current.some((item) => item.id === id) ? current : [...current, track],
        );
        return track;
      } catch {
        return null;
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
    } catch {}
  }, []);

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
      } catch {}
    },
    [],
  );
  const acceptLyrics = useCallback(async (id: string, result: LyricsResult) => {
    const updated = await saveLyricsResult(id, result);
    setTracks((current) =>
      current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
    );
  }, []);

  const applyDetails = useCallback(
    async (id: string, patch: Record<string, unknown>, expected?: Track) => {
      const updated = await applyOnlineDetails(
        id,
        patch as Parameters<typeof applyOnlineDetails>[1],
        { checked: true, expected },
      );
      if (updated)
        setTracks((current) =>
          current.map((track) => (track.id === id ? { ...updated, blob: track.blob } : track)),
        );
      return updated;
    },
    [],
  );
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
    addPlaylistVideo,
    toggleFavorite,
    editMetadata,
    resolveRoles,
    restoreMetadata,
    remove,
  };
}
