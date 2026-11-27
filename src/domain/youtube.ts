export interface YouTubeVideo {
  kind: 'video';
  videoId: string;
  playlistId?: string;
  startAt?: number;
}
export interface YouTubePlaylist {
  kind: 'playlist';
  playlistId: string;
}
export type YouTubeLink = YouTubeVideo | YouTubePlaylist;

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;
export const YOUTUBE_PLAYLIST_ID = /^(?:LL|WL|[A-Za-z0-9_-]{10,64})$/u;
export const YOUTUBE_EMBED_HOST = 'https://www.youtube-nocookie.com';
export const YOUTUBE_FALLBACK_EMBED_HOST = 'https://www.youtube.com';

export function isYouTubeEmbedOrigin(origin: string): boolean {
  return origin === YOUTUBE_EMBED_HOST || origin === YOUTUBE_FALLBACK_EMBED_HOST;
}

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

function parseTimestamp(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 ? seconds : undefined;
}

function fromUrl(url: URL): YouTubeLink | null {
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] === 'attribution_link') {
    const nested = url.searchParams.get('u');
    if (nested) {
      try {
        return fromUrl(new URL(nested, 'https://www.youtube.com'));
      } catch {
        return null;
      }
    }
    return null;
  }
  if (host.endsWith('youtu.be')) {
    const candidate = segments[0] ?? '';
    if (!YOUTUBE_VIDEO_ID.test(candidate)) return null;
    const list = url.searchParams.get('list');
    return {
      kind: 'video',
      videoId: candidate,
      ...(list && YOUTUBE_PLAYLIST_ID.test(list) ? { playlistId: list } : {}),
      ...startAt(url),
    };
  }
  if (segments[0] === 'playlist') {
    const list = url.searchParams.get('list') ?? '';
    return YOUTUBE_PLAYLIST_ID.test(list) ? { kind: 'playlist', playlistId: list } : null;
  }
  if (['shorts', 'embed', 'live', 'v', 'e'].includes(segments[0] ?? '')) {
    const candidate = segments[1] ?? '';
    const list = url.searchParams.get('list');
    return YOUTUBE_VIDEO_ID.test(candidate)
      ? {
          kind: 'video',
          videoId: candidate,
          ...(list && YOUTUBE_PLAYLIST_ID.test(list) ? { playlistId: list } : {}),
          ...startAt(url),
        }
      : null;
  }
  const video = url.searchParams.get('v') ?? '';
  if (YOUTUBE_VIDEO_ID.test(video)) {
    const list = url.searchParams.get('list');
    return {
      kind: 'video',
      videoId: video,
      ...(list && YOUTUBE_PLAYLIST_ID.test(list) ? { playlistId: list } : {}),
      ...startAt(url),
    };
  }

  const listOnly = url.searchParams.get('list') ?? '';
  if (listOnly && YOUTUBE_PLAYLIST_ID.test(listOnly)) {
    return { kind: 'playlist', playlistId: listOnly };
  }
  return null;
}

function startAt(url: URL): { startAt?: number } {
  const seconds = parseTimestamp(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return seconds ? { startAt: seconds } : {};
}

export function parseYouTubeLink(input: string): YouTubeLink | null {
  const text = input.trim();
  if (!text) return null;
  if (YOUTUBE_VIDEO_ID.test(text)) return { kind: 'video', videoId: text };

  const embeddedUrl =
    /\bhttps?:\/\/[^\s<>"]+|\b(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s<>"]+/iu.exec(
      text,
    )?.[0];
  const candidate = embeddedUrl ?? text;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//iu.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  return fromUrl(url);
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export interface EmbedOptions {
  startAt?: number;

  origin?: string;
  autoplay?: boolean;

  loop?: boolean;
  title?: boolean;

  controls?: boolean;

  mute?: boolean;

  disableKeyboard?: boolean;

  host?: string;
}

export function youtubeEmbedUrl(videoId: string, options: EmbedOptions = {}): string {
  if (!YOUTUBE_VIDEO_ID.test(videoId)) throw new Error('Invalid YouTube video ID.');
  const params = new URLSearchParams({
    rel: '0',
    playsinline: '1',
    enablejsapi: '1',
    widgetid: '1',
  });
  if (options.startAt && options.startAt > 0)
    params.set('start', String(Math.floor(options.startAt)));
  if (options.autoplay) params.set('autoplay', '1');
  if (options.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  if (options.title === false) params.set('showinfo', '0');
  if (options.controls === false) params.set('controls', '0');
  if (options.mute) params.set('mute', '1');
  if (options.disableKeyboard) params.set('disablekb', '1');
  params.set('iv_load_policy', '3');
  params.set('modestbranding', '1');
  params.set('fs', '0');
  params.set('cc_load_policy', '0');
  if (options.origin && isSafeOrigin(options.origin)) params.set('origin', options.origin);
  const baseHost =
    options.host === YOUTUBE_FALLBACK_EMBED_HOST ? YOUTUBE_FALLBACK_EMBED_HOST : YOUTUBE_EMBED_HOST;
  return `${baseHost}/embed/${videoId}?${params.toString()}`;
}

export function isSafeOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && (url.protocol === 'https:' || url.protocol === 'http:');
  } catch {
    return false;
  }
}

export type EmbedPlayerState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

const STATES: Record<number, EmbedPlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

export function embedPlayerState(code: unknown): EmbedPlayerState | null {
  return typeof code === 'number' && code in STATES ? STATES[code] : null;
}

export function readEmbedEvent(
  data: unknown,
  expectedVideoId: string,
): { state: EmbedPlayerState; currentTime: number; duration: number; videoId: string } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { event?: unknown; info?: unknown };
  if (payload.event !== 'infoDelivery' || !payload.info || typeof payload.info !== 'object')
    return null;
  const info = payload.info as {
    playerState?: unknown;
    currentTime?: unknown;
    duration?: unknown;
    videoData?: { video_id?: unknown };
  };
  const state = embedPlayerState(info.playerState);
  if (!state) return null;
  const videoId =
    typeof info.videoData?.video_id === 'string' ? info.videoData.video_id : expectedVideoId;
  if (videoId !== expectedVideoId) return null;
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  return { state, currentTime: number(info.currentTime), duration: number(info.duration), videoId };
}

export function readEmbedProgress(
  data: unknown,
  expectedVideoId: string,
): { currentTime: number; duration: number; state?: EmbedPlayerState } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { event?: unknown; info?: unknown };
  if (payload.event !== 'infoDelivery' || !payload.info || typeof payload.info !== 'object')
    return null;
  const info = payload.info as {
    playerState?: unknown;
    currentTime?: unknown;
    duration?: unknown;
    videoData?: { video_id?: unknown };
  };
  const videoId =
    typeof info.videoData?.video_id === 'string' ? info.videoData.video_id : expectedVideoId;
  if (videoId !== expectedVideoId) return null;
  if (typeof info.currentTime !== 'number' || !Number.isFinite(info.currentTime)) return null;
  const state = embedPlayerState(info.playerState);
  const duration =
    typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0
      ? info.duration
      : 0;
  return {
    currentTime: Math.max(0, info.currentTime),
    duration,
    ...(state ? { state } : {}),
  };
}

export function readEmbedError(
  data: unknown,
  expectedVideoId: string,
): { code: number; videoId: string } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { event?: unknown; info?: unknown };
  if (payload.event !== 'onError') return null;
  const info = payload.info as
    { errorCode?: unknown; videoData?: { video_id?: unknown } } | undefined;
  const code =
    typeof payload.info === 'number'
      ? payload.info
      : typeof info?.errorCode === 'number'
        ? info.errorCode
        : 0;
  if (!code) return null;
  const videoId =
    typeof info?.videoData?.video_id === 'string' ? info.videoData.video_id : expectedVideoId;
  if (videoId !== expectedVideoId) return null;
  return { code, videoId };
}

export function embedErrorMessage(code: number): string {
  if (code === 101 || code === 150)
    return 'The owner does not allow this video to play outside YouTube. Open it on YouTube to listen.';
  if (code === 100) return 'This video is private or no longer available.';
  if (code === 153)
    return 'YouTube could not identify this player. Open the video on YouTube to listen.';
  if (code === 2)
    return 'YouTube rejected the player request. Open the video on YouTube to listen.';
  return 'YouTube could not play this video here. Open it on YouTube to listen.';
}
