/**
 * YouTube links for Wave 1.1.
 *
 * Wave stores a YouTube reference and plays it through the official embedded
 * player. No audio is downloaded, proxied or extracted: the video stays on
 * YouTube and playback requires a network connection.
 */
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
export const YOUTUBE_PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/u;
export const YOUTUBE_EMBED_HOST = 'https://www.youtube-nocookie.com';

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
  if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')) {
    const candidate = segments[1] ?? '';
    return YOUTUBE_VIDEO_ID.test(candidate)
      ? { kind: 'video', videoId: candidate, ...startAt(url) }
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
  return null;
}

function startAt(url: URL): { startAt?: number } {
  const seconds = parseTimestamp(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return seconds ? { startAt: seconds } : {};
}

/**
 * Accepts watch/youtu.be/shorts/embed/live/music URLs, `youtube.com/playlist`
 * links, and a bare 11-character video ID. Anything else returns null instead of
 * guessing, so the interface can explain the problem.
 */
export function parseYouTubeLink(input: string): YouTubeLink | null {
  const text = input.trim();
  if (!text) return null;
  if (YOUTUBE_VIDEO_ID.test(text)) return { kind: 'video', videoId: text };
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//iu.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
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
  /** Same-origin page that hosts the iframe; omitted when it is not a valid origin. */
  origin?: string;
  autoplay?: boolean;
  /** Loop needs the video ID repeated in `playlist`. */
  loop?: boolean;
  title?: boolean;
  /** Hidden player chrome; Wave renders its own controls. */
  controls?: boolean;
  /** Backdrop use: the clip is always muted, audio comes from the local file. */
  mute?: boolean;
  /** Disables the player's own keyboard shortcuts so Wave keeps focus handling. */
  disableKeyboard?: boolean;
}

/** Player URL for the privacy-enhanced `youtube-nocookie.com` embed. */
export function youtubeEmbedUrl(videoId: string, options: EmbedOptions = {}): string {
  if (!YOUTUBE_VIDEO_ID.test(videoId)) throw new Error('Invalid YouTube video ID.');
  const params = new URLSearchParams({
    rel: '0',
    playsinline: '1',
    enablejsapi: '1',
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
  return `${YOUTUBE_EMBED_HOST}/embed/${videoId}?${params.toString()}`;
}

/** Only http(s) page origins are forwarded to the player. */
export function isSafeOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && (url.protocol === 'https:' || url.protocol === 'http:');
  } catch {
    return false;
  }
}

/** Player state values documented by the YouTube IFrame API. */
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

/**
 * Messages from the embedded player are treated as untrusted input. Only the
 * documented shape from the expected frame is accepted.
 */
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

/**
 * The player's own clock, when it reports one.
 *
 * The periodic `infoDelivery` message does not always carry a `playerState`, and
 * a player that is merely sending its position is still perfectly useful: that
 * position is the only way to know whether the picture is where the song is.
 * State is therefore optional here; the caller keeps the last one it knew.
 */
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

/**
 * A refused video from the embedded player.
 *
 * The IFrame API reports failures as documented error codes: 2 (bad parameter),
 * 5 (the player itself failed), 100 (the video is gone or private), 101 and 150
 * (the owner does not allow embedding). Without this the song simply never
 * started and nothing explained why.
 */
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

/** Plain-language reason for an embed error code. */
export function embedErrorMessage(code: number): string {
  if (code === 101 || code === 150)
    return 'The owner does not allow this video to play outside YouTube. Open it on YouTube to listen.';
  if (code === 100) return 'This video is private or no longer available.';
  if (code === 2)
    return 'YouTube rejected the player request. Open the video on YouTube to listen.';
  return 'YouTube could not play this video here. Open it on YouTube to listen.';
}
