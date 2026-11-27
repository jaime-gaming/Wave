import { parseYouTubeLink, youtubeThumbnailUrl, type YouTubeVideo } from './youtube';

export const CLIP_STORAGE_KEY = 'wave-video-clips-v1';
const CLIP_EXCLUSIONS_KEY = 'wave-video-clip-exclusions-v1';

export const MAX_CLIP_ENTRIES = 2_000;

export interface StoredClip {
  videoId: string;

  startAt: number;
  addedAt: number;

  duration?: number;
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
      typeof entry.startAt === 'number' && Number.isFinite(entry.startAt) && entry.startAt !== 0
        ? Math.max(-86_400, Math.min(86_400, Math.round(entry.startAt)))
        : 0;
    const addedAt =
      typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : 0;
    const duration =
      typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0
        ? Math.min(86_400, Math.floor(entry.duration))
        : 0;
    map[trackId] = { videoId: entry.videoId, startAt: start, addedAt, duration };
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

export const CLIPS_CHANGED = 'wave:clips-changed';

function persist(map: ClipMap, store: Storage | null): boolean {
  if (!store) return false;
  try {
    store.setItem(CLIP_STORAGE_KEY, JSON.stringify(map));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLIPS_CHANGED));
    return true;
  } catch {
    return false;
  }
}

function clipExclusions(store: Storage | null): string[] {
  try {
    const data: unknown = JSON.parse(store?.getItem(CLIP_EXCLUSIONS_KEY) ?? '[]');
    return Array.isArray(data)
      ? data.filter((id): id is string => typeof id === 'string').slice(-MAX_CLIP_ENTRIES)
      : [];
  } catch {
    return [];
  }
}

export function clipExcluded(trackId: string, store: Storage | null = storage()): boolean {
  return clipExclusions(store).includes(trackId);
}

function setClipExcluded(trackId: string, excluded: boolean, store: Storage | null) {
  if (!store) return;
  try {
    const ids = clipExclusions(store).filter((id) => id !== trackId);
    if (excluded) ids.push(trackId);
    store.setItem(CLIP_EXCLUSIONS_KEY, JSON.stringify(ids.slice(-MAX_CLIP_ENTRIES)));
  } catch {}
}

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
    duration: 0,
  };
  const map = { ...loadClips(store), [trackId]: clip };
  setClipExcluded(trackId, false, store);
  persist(map, store);
  return { ok: true, clip };
}

export function storeClip(
  trackId: string,
  videoId: string,
  startAt = 0,
  store: Storage | null = storage(),
  duration = 0,
): StoredClip | null {
  if (!trackId || !/^[A-Za-z0-9_-]{11}$/u.test(videoId)) return null;
  const clip: StoredClip = {
    videoId,
    startAt:
      Number.isFinite(startAt) && startAt !== 0
        ? Math.max(-86_400, Math.min(86_400, Math.round(startAt)))
        : 0,
    addedAt: Date.now(),
    duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
  };
  persist({ ...loadClips(store), [trackId]: clip }, store);
  return clip;
}

export function removeClip(trackId: string, store: Storage | null = storage()): ClipMap {
  const map = loadClips(store);
  delete map[trackId];
  setClipExcluded(trackId, true, store);
  persist(map, store);
  return map;
}

export function getClip(trackId: string, map: ClipMap = loadClips()): StoredClip | undefined {
  return map[trackId];
}

export function clipThumbnail(clip: StoredClip): string {
  return youtubeThumbnailUrl(clip.videoId);
}
