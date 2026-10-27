import { parseYouTubeLink, youtubeThumbnailUrl, type YouTubeVideo } from './youtube';

/**
 * The clip chosen for a song, stored locally per track.
 *
 * Wave 1.1 has no provider catalogue yet, so the user pastes the YouTube link
 * for a song once. It is kept in localStorage keyed by track ID: no account, no
 * upload, and the mapping never leaves the device. Deleting it stops the clip.
 */
export const CLIP_STORAGE_KEY = 'wave-video-clips-v1';
/** Upper bound so a corrupted entry cannot grow unbounded. */
export const MAX_CLIP_ENTRIES = 2_000;

export interface StoredClip {
  videoId: string;
  /** Start offset inside the video, in seconds. */
  startAt: number;
  addedAt: number;
}

export type ClipMap = Record<string, StoredClip>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function sanitize(value: unknown): ClipMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const map: ClipMap = {};
  for (const [trackId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!trackId || typeof raw !== 'object' || !raw) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/u.test(entry.videoId)) continue;
    const start =
      typeof entry.startAt === 'number' && Number.isFinite(entry.startAt) && entry.startAt > 0
        ? Math.min(86_400, Math.floor(entry.startAt))
        : 0;
    const addedAt =
      typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : 0;
    map[trackId] = { videoId: entry.videoId, startAt: start, addedAt };
    if (Object.keys(map).length >= MAX_CLIP_ENTRIES) break;
  }
  return map;
}

export function loadClips(store: Storage | null = storage()): ClipMap {
  if (!store) return {};
  try {
    const raw = store.getItem(CLIP_STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function persist(map: ClipMap, store: Storage | null): boolean {
  if (!store) return false;
  try {
    store.setItem(CLIP_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    // Quota or private mode: the clip still works for this session.
    return false;
  }
}

/** Saves a pasted link. Returns the parsed clip or a user-facing error. */
export function saveClip(
  trackId: string,
  link: string,
  store: Storage | null = storage(),
): { ok: true; clip: StoredClip } | { ok: false; error: string } {
  if (!trackId) return { ok: false, error: 'Choose a song first.' };
  const parsed = parseYouTubeLink(link);
  if (!parsed) return { ok: false, error: 'Paste a YouTube video link.' };
  if (parsed.kind !== 'video')
    return {
      ok: false,
      error: 'That is a playlist link. Open the song you want and copy its video link.',
    };
  const clip: StoredClip = {
    videoId: (parsed as YouTubeVideo).videoId,
    startAt: (parsed as YouTubeVideo).startAt ?? 0,
    addedAt: Date.now(),
  };
  const map = { ...loadClips(store), [trackId]: clip };
  persist(map, store);
  return { ok: true, clip };
}

/** Saves a clip Wave found itself, with a validated video id. */
export function storeClip(
  trackId: string,
  videoId: string,
  startAt = 0,
  store: Storage | null = storage(),
): StoredClip | null {
  if (!trackId || !/^[A-Za-z0-9_-]{11}$/u.test(videoId)) return null;
  const clip: StoredClip = {
    videoId,
    startAt: Number.isFinite(startAt) && startAt > 0 ? Math.floor(startAt) : 0,
    addedAt: Date.now(),
  };
  persist({ ...loadClips(store), [trackId]: clip }, store);
  return clip;
}

export function removeClip(trackId: string, store: Storage | null = storage()): ClipMap {
  const map = loadClips(store);
  delete map[trackId];
  persist(map, store);
  return map;
}

export function getClip(trackId: string, map: ClipMap = loadClips()): StoredClip | undefined {
  return map[trackId];
}

export function clipThumbnail(clip: StoredClip): string {
  return youtubeThumbnailUrl(clip.videoId);
}
