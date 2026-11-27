import {
  parseKugouCandidates,
  parseNetEaseSongs,
  rankProviderSongs,
} from '../domain/wordProviders';
import { parseImportLink } from '../domain/linkImport';
import {
  parseYouTubeLink,
  YOUTUBE_PLAYLIST_ID,
  YOUTUBE_VIDEO_ID,
  youtubeThumbnailUrl,
} from '../domain/youtube';

function canonicalPlaylistUrl(
  input: string,
): { provider: 'spotify' | 'youtube' | 'deezer'; fetchUrl: string } | null {
  const parsed = parseImportLink(input);
  if (!parsed.ok) return null;
  const { target } = parsed;
  if (target.provider === 'spotify') {
    if (target.kind !== 'playlist' && target.kind !== 'album' && target.kind !== 'track')
      return null;
    return {
      provider: 'spotify',
      fetchUrl: `https://open.spotify.com/embed/${target.kind}/${encodeURIComponent(target.id)}`,
    };
  }
  if (target.provider === 'deezer')
    return { provider: 'deezer', fetchUrl: `https://api.deezer.com/playlist/${target.id}/tracks` };
  const listId = target.kind === 'playlist' ? target.id : target.playlistId;
  if (!listId) return null;
  return {
    provider: 'youtube',
    fetchUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=en`,
  };
}

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
}

const HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};
const MAX_BODY = 1_500_000;
const MAX_TRACKS = 300;
const TIMEOUT_MS = 10_000;

const YOUTUBE_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  cookie:
    'SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg; CONSENT=YES+cb.20210328-17-p0.en+FX+999',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

const clean = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[\r\n\t]+/gu, ' ')
        .trim()
        .slice(0, 180)
    : '';

const csv = (value: string) => (/[",]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value);

function textOf(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as { simpleText?: unknown; runs?: Array<{ text?: unknown }> };
  if (typeof record.simpleText === 'string') return clean(record.simpleText);
  if (Array.isArray(record.runs)) return clean(record.runs.map((run) => run.text ?? '').join(''));
  return '';
}

function durationFromText(value: string): number {
  const parts = value
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function walk(node: unknown, visit: (record: Record<string, unknown>) => void, depth = 0) {
  if (depth > 28 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  visit(record);
  for (const value of Object.values(record)) walk(value, visit, depth + 1);
}

function extractBalancedJson(html: string, marker: string): unknown {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const open = html.indexOf('{', start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const next = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/iu.exec(html);
  if (next) {
    try {
      blocks.push(JSON.parse(next[1]));
    } catch {}
  }
  for (const marker of [
    'var ytInitialData =',
    'window["ytInitialData"] =',
    'ytInitialData =',
    'var ytInitialPlayerResponse =',
    'ytInitialPlayerResponse =',
  ]) {
    const parsed = extractBalancedJson(html, marker);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

export interface ExtractedYouTubeVideo {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}

export function extractYouTubePlaylistVideos(html: string): {
  title: string;
  videos: ExtractedYouTubeVideo[];
} {
  const videos: ExtractedYouTubeVideo[] = [];
  const seen = new Set<string>();
  let playlistTitle = '';

  const pushVideo = (videoId: string, title: string, artist: string, duration = 0) => {
    if (!YOUTUBE_VIDEO_ID.test(videoId) || seen.has(videoId) || videos.length >= MAX_TRACKS) return;
    const cleanTitle = clean(title);
    if (!cleanTitle) return;
    seen.add(videoId);
    videos.push({
      videoId,
      title: cleanTitle,
      artist: clean(artist),
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
      thumbnail: youtubeThumbnailUrl(videoId),
    });
  };

  for (const block of extractJsonBlocks(html)) {
    walk(block, (record) => {
      if (!playlistTitle) {
        const meta = record.playlistMetadataRenderer as { title?: unknown } | undefined;
        if (meta && typeof meta.title === 'string') playlistTitle = clean(meta.title);
        const header = record.playlistHeaderRenderer as { title?: unknown } | undefined;
        if (header) playlistTitle = textOf(header.title) || playlistTitle;
      }

      const renderer = (record.playlistVideoRenderer ?? record.playlistPanelVideoRenderer) as
        Record<string, unknown> | undefined;
      if (renderer) {
        const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : '';
        const title = textOf(renderer.title);
        const artist = textOf(renderer.shortBylineText) || textOf(renderer.longBylineText);
        const lenSec = Number(renderer.lengthSeconds);
        const duration =
          Number.isFinite(lenSec) && lenSec > 0
            ? lenSec
            : durationFromText(textOf(renderer.lengthText));
        pushVideo(videoId, title, artist, duration);
      }

      const musicItem = record.musicResponsiveListItemRenderer as
        | {
            playlistItemData?: { videoId?: unknown };
            flexColumns?: Array<{
              musicResponsiveListItemFlexColumnRenderer?: { text?: unknown };
            }>;
          }
        | undefined;
      if (musicItem?.playlistItemData && typeof musicItem.playlistItemData.videoId === 'string') {
        const cols = musicItem.flexColumns ?? [];
        const title = textOf(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
        const artist = textOf(cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text);
        pushVideo(musicItem.playlistItemData.videoId, title, artist);
      }
    });
  }

  return { title: playlistTitle, videos };
}

export function extractYouTubeVideoMeta(
  html: string,
  expectedId: string,
): ExtractedYouTubeVideo | null {
  for (const block of extractJsonBlocks(html)) {
    let found: ExtractedYouTubeVideo | null = null;
    walk(block, (record) => {
      if (found) return;
      const details = record.videoDetails as Record<string, unknown> | undefined;
      if (!details || typeof details !== 'object') return;
      const id = typeof details.videoId === 'string' ? details.videoId : '';
      if (id && id !== expectedId) return;
      const title = clean(details.title);
      if (!title) return;
      const author = clean(details.author);
      const seconds = Number(details.lengthSeconds);
      found = {
        videoId: expectedId,
        title,
        artist: author,
        duration: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0,
        thumbnail: youtubeThumbnailUrl(expectedId),
      };
    });
    if (found) return found;
  }
  return null;
}

export function publicPlaylistText(html: string): string {
  const rows: string[] = [];
  const push = (title: string, artist: string, album = '') => {
    if (!title || rows.length >= MAX_TRACKS) return;
    rows.push([csv(title), csv(artist), csv(album)].join(','));
  };
  for (const block of extractJsonBlocks(html)) {
    walk(block, (record) => {
      if (Array.isArray(record.trackList)) {
        for (const item of record.trackList) {
          if (!item || typeof item !== 'object') continue;
          const track = item as Record<string, unknown>;
          push(clean(track.title), clean(track.subtitle), clean(track.album));
        }
      }
      const yt = (record.playlistVideoRenderer ?? record.playlistPanelVideoRenderer) as
        Record<string, unknown> | undefined;
      if (yt) {
        push(textOf(yt.title), textOf(yt.shortBylineText) || textOf(yt.longBylineText));
      }
      const musicItem = record.musicResponsiveListItemRenderer as
        | {
            flexColumns?: Array<{
              musicResponsiveListItemFlexColumnRenderer?: { text?: unknown };
            }>;
          }
        | undefined;
      if (musicItem?.flexColumns?.length) {
        const title = textOf(
          musicItem.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text,
        );
        const artist = textOf(
          musicItem.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text,
        );
        push(title, artist);
      }
    });
  }
  return rows.length ? `Title,Artist,Album\n${rows.join('\n')}` : '';
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, MAX_BODY);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < MAX_BODY) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, MAX_BODY);
}

function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function handleImportPlaylist(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!isSameOrigin(request, url))
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  let target: ReturnType<typeof canonicalPlaylistUrl>;
  try {
    const body = (await request.json()) as { url?: unknown };
    target = typeof body.url === 'string' ? canonicalPlaylistUrl(body.url) : null;
  } catch {
    return json({ error: 'Send a JSON body with a public playlist link.' }, 400);
  }
  if (!target) return json({ error: 'Use a public Spotify or YouTube playlist link.' }, 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (target.provider === 'deezer') {
      const rows: string[] = ['title,artist,album,duration'];
      let partial = false;
      for (let offset = 0; offset < MAX_TRACKS; offset += 100) {
        const upstream = await fetch(`${target.fetchUrl}?limit=100&index=${offset}`, {
          redirect: 'error',
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!upstream.ok) {
          if (rows.length === 1)
            return json({ error: 'That public playlist could not be read.' }, 502);
          partial = true;
          break;
        }
        const data = JSON.parse(await readBoundedText(upstream)) as {
          data?: unknown;
          next?: unknown;
        };
        if (!Array.isArray(data.data)) {
          partial = true;
          break;
        }
        for (const item of data.data.slice(0, 100)) {
          if (!item || typeof item !== 'object') continue;
          const row = item as {
            title?: unknown;
            artist?: { name?: unknown };
            album?: { title?: unknown };
            duration?: unknown;
          };
          const title = clean(row.title),
            artist = clean(row.artist?.name),
            album = clean(row.album?.title);
          if (!title) continue;
          const duration =
            typeof row.duration === 'number' && Number.isFinite(row.duration) && row.duration > 0
              ? Math.round(row.duration)
              : 0;
          rows.push([title, artist, album, String(duration)].map(csv).join(','));
        }
        if (!data.next || data.data.length === 0) break;
        if (offset + 100 >= MAX_TRACKS) partial = true;
      }
      if (rows.length === 1)
        return json({ error: 'No public tracks were found at that link.' }, 422);
      return json({ provider: 'deezer', text: rows.join('\n'), partial });
    }
    const fetchHeaders =
      target.provider === 'youtube'
        ? YOUTUBE_HEADERS
        : { accept: 'text/html,application/xhtml+xml' };
    const upstream = await fetch(target.fetchUrl, {
      redirect: 'error',
      signal: controller.signal,
      headers: fetchHeaders,
    });
    if (!upstream.ok) return json({ error: 'That public playlist could not be read.' }, 502);
    const text = publicPlaylistText(await readBoundedText(upstream));
    if (!text) return json({ error: 'No public tracks were found at that link.' }, 422);
    return json({ provider: target.provider, text });
  } catch {
    return json({ error: 'Could not reach the playlist provider right now.' }, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function handleYouTubeMeta(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }
  if (!isSameOrigin(request, url)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }
  let raw = url.searchParams.get('id') ?? url.searchParams.get('url') ?? '';
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as { id?: unknown; url?: unknown };
      raw = typeof body.id === 'string' ? body.id : typeof body.url === 'string' ? body.url : raw;
    } catch {
      return json({ error: 'Send a JSON body with a YouTube video ID or link.' }, 400);
    }
  }
  const parsed = parseYouTubeLink(raw);
  const videoId =
    parsed?.kind === 'video' ? parsed.videoId : YOUTUBE_VIDEO_ID.test(raw.trim()) ? raw.trim() : '';
  if (!videoId) return json({ error: 'Invalid YouTube video ID.' }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    let title = '';
    let author = '';
    let duration = 0;

    try {
      const oembedRes = await fetch(oembedUrl, {
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': YOUTUBE_HEADERS['user-agent'],
        },
      });
      if (oembedRes.ok) {
        const data = (await oembedRes.json()) as { title?: unknown; author_name?: unknown };
        title = clean(data.title);
        author = clean(data.author_name);
      }
    } catch {}

    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
        redirect: 'error',
        signal: controller.signal,
        headers: YOUTUBE_HEADERS,
      });
      if (watchRes.ok) {
        const meta = extractYouTubeVideoMeta(await readBoundedText(watchRes), videoId);
        if (meta) {
          if (!title) title = meta.title;
          if (!author) author = meta.artist;
          if (meta.duration > 0) duration = meta.duration;
        }
      }
    } catch {}

    if (!title) {
      return json({ error: 'Video metadata could not be read.' }, 404);
    }
    return json({
      videoId,
      title,
      author,
      duration,
      thumbnail: youtubeThumbnailUrl(videoId),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handleYouTubePlaylist(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!isSameOrigin(request, url)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }
  let raw: string;
  try {
    const body = (await request.json()) as { url?: unknown; list?: unknown };
    raw = typeof body.list === 'string' ? body.list : typeof body.url === 'string' ? body.url : '';
  } catch {
    return json({ error: 'Send a JSON body with a YouTube playlist link.' }, 400);
  }
  const parsed = parseYouTubeLink(raw);
  const playlistId =
    parsed?.kind === 'playlist'
      ? parsed.playlistId
      : parsed?.kind === 'video' && parsed.playlistId
        ? parsed.playlistId
        : YOUTUBE_PLAYLIST_ID.test(raw.trim())
          ? raw.trim()
          : '';
  if (!playlistId) return json({ error: 'Use a public YouTube playlist link.' }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(
      `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=en`,
      {
        redirect: 'error',
        signal: controller.signal,
        headers: YOUTUBE_HEADERS,
      },
    );
    if (!upstream.ok) return json({ error: 'That YouTube playlist could not be read.' }, 502);
    const { title, videos } = extractYouTubePlaylistVideos(await readBoundedText(upstream));
    if (!videos.length) {
      return json({ error: 'No public videos were found in that YouTube playlist.' }, 422);
    }
    return json({ playlistId, title: title || 'YouTube playlist', videos });
  } catch {
    return json({ error: 'Could not reach YouTube right now.' }, 502);
  } finally {
    clearTimeout(timer);
  }
}

export interface YouTubeSearchItem {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
}

const SEARCH_CACHE = new Map<string, { at: number; items: YouTubeSearchItem[] }>();
const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const SEARCH_CACHE_MAX = 80;

function parseDurationText(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d{1,2}(?::\d{2}){1,2}$/u.test(trimmed)) return 0;
  return trimmed
    .split(':')
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
}

export function extractYouTubeSearchResults(
  source: string | unknown,
  limit = 10,
): YouTubeSearchItem[] {
  const roots: unknown[] =
    typeof source === 'string'
      ? extractJsonBlocks(source)
      : source && typeof source === 'object'
        ? [source]
        : [];
  if (!roots.length) return [];

  const items: YouTubeSearchItem[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [...roots];
  let visited = 0;

  while (stack.length && visited < 4_500 && items.length < limit) {
    visited++;
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
      continue;
    }
    const obj = current as Record<string, unknown>;
    const renderer = (obj.videoRenderer ?? obj.compactVideoRenderer) as
      Record<string, unknown> | undefined;
    if (renderer && typeof renderer === 'object') {
      const videoId = typeof renderer.videoId === 'string' ? renderer.videoId.trim() : '';
      if (videoId && YOUTUBE_VIDEO_ID.test(videoId) && !seen.has(videoId)) {
        const title = textOf(renderer.title);
        const author =
          textOf(renderer.ownerText) ||
          textOf(renderer.longBylineText) ||
          textOf(renderer.shortBylineText);
        const lengthText = textOf(renderer.lengthText);
        const duration = parseDurationText(lengthText);

        const isLive = /live/iu.test(lengthText);
        if (title && !isLive) {
          seen.add(videoId);
          items.push({
            videoId,
            title,
            author: author || 'YouTube',
            duration,
            thumbnail: youtubeThumbnailUrl(videoId),
          });
        }
      }
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return items;
}

async function handleYouTubeSearch(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!isSameOrigin(request, url)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }
  let q: string;
  let limit = 8;
  try {
    const body = (await request.json()) as { q?: unknown; query?: unknown; limit?: unknown };
    q = clean(
      typeof body.q === 'string' ? body.q : typeof body.query === 'string' ? body.query : '',
    );
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(15, Math.round(body.limit)));
    }
  } catch {
    return json({ error: 'Send a search query.' }, 400);
  }
  if (q.length < 2) return json({ items: [] });

  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return json({ items: cached.items });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  try {
    let items: YouTubeSearchItem[] = [];

    try {
      const innerRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          ...YOUTUBE_HEADERS,
          'content-type': 'application/json',
          origin: 'https://www.youtube.com',
          referer: 'https://www.youtube.com/',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20250101.00.00',
              hl: 'en',
              gl: 'US',
            },
          },
          query: q,
        }),
      });
      if (innerRes.ok) {
        const data = (await innerRes.json().catch(() => null)) as unknown;
        items = extractYouTubeSearchResults(data, limit);
      }
    } catch {}

    if (!items.length && !controller.signal.aborted) {
      const htmlRes = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`,
        {
          redirect: 'error',
          signal: controller.signal,
          headers: YOUTUBE_HEADERS,
        },
      );
      if (htmlRes.ok) {
        items = extractYouTubeSearchResults(await readBoundedText(htmlRes), limit);
      }
    }

    if (items.length) {
      if (SEARCH_CACHE.size >= SEARCH_CACHE_MAX) {
        const oldest = SEARCH_CACHE.keys().next().value;
        if (oldest !== undefined) SEARCH_CACHE.delete(oldest);
      }
      SEARCH_CACHE.set(cacheKey, { at: Date.now(), items });
    }
    return json({ items });
  } catch {
    return json({ error: 'Search is unreachable right now.', items: [] }, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonSafe(
  targetUrl: string,
  signal: AbortSignal,
  headers?: Record<string, string>,
): Promise<unknown> {
  try {
    const res = await fetch(targetUrl, {
      redirect: 'error',
      signal,
      headers: {
        accept: 'application/json',
        'user-agent': YOUTUBE_HEADERS['user-agent'],
        ...(headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as unknown;
  } catch {
    return null;
  }
}

async function handleWordLyrics(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!isSameOrigin(request, url)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }
  let title: string;
  let artist: string;
  let duration = 0;
  try {
    const body = (await request.json()) as {
      title?: unknown;
      artist?: unknown;
      duration?: unknown;
    };
    title = clean(body.title);
    artist = clean(body.artist);
    if (typeof body.duration === 'number' && Number.isFinite(body.duration) && body.duration > 0)
      duration = body.duration;
  } catch {
    return json({ error: 'Send song title and artist.' }, 400);
  }
  if (!title || !artist) return json({ results: [] });

  const q = `${title} ${artist}`.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  try {
    const wanted = { title, artist, duration };
    const neteaseTask = (async () => {
      const search = await fetchJsonSafe(
        `https://music.163.com/api/search/get/web?s=${encodeURIComponent(q)}&type=1&limit=8`,
        controller.signal,
        { referer: 'https://music.163.com/' },
      );
      const songs = rankProviderSongs(parseNetEaseSongs(search), wanted).slice(0, 3);
      const results = await Promise.all(
        songs.map(async (song) => {
          const payload = (await fetchJsonSafe(
            `https://music.163.com/api/song/lyric?id=${encodeURIComponent(song.id)}&lv=-1&kv=-1&tv=-1&yv=-1`,
            controller.signal,
            { referer: 'https://music.163.com/' },
          )) as { yrc?: { lyric?: string } } | null;
          const yrc = typeof payload?.yrc?.lyric === 'string' ? payload.yrc.lyric : '';
          return yrc ? { provider: 'netease', ...song, yrc } : null;
        }),
      );
      return results.filter((item) => item !== null);
    })();

    const kugouTask = (async () => {
      const search = await fetchJsonSafe(
        `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(q)}`,
        controller.signal,
      );
      const songs = rankProviderSongs(parseKugouCandidates(search), wanted).slice(0, 3);
      const results = await Promise.all(
        songs.map(async (song) => {
          const payload = (await fetchJsonSafe(
            `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(song.id)}&accesskey=${encodeURIComponent(song.accessKey ?? '')}&fmt=krc&charset=utf8`,
            controller.signal,
          )) as { content?: string } | null;
          return typeof payload?.content === 'string' && payload.content
            ? {
                provider: 'kugou',
                id: song.id,
                title: song.title,
                artist: song.artist,
                duration: song.duration,
                krc: payload.content,
              }
            : null;
        }),
      );
      return results.filter((item) => item !== null);
    })();

    const [netease, kugou] = await Promise.all([neteaseTask, kugouTask]);
    return json({ results: [...netease, ...kugou] });
  } catch {
    return json({ results: [] });
  } finally {
    clearTimeout(timer);
  }
}

async function handleDeezerSearch(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!isSameOrigin(request, url))
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  let query: string;
  try {
    query = clean(((await request.json()) as { query?: unknown }).query);
  } catch {
    return json({ error: 'Send a search query.' }, 400);
  }
  if (query.length < 2) return json({ results: [] });
  try {
    const response = await fetch(
      `https://api.deezer.com/search?${new URLSearchParams({ q: query, limit: '20' })}`,
      {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
        headers: { accept: 'application/json' },
      },
    );
    if (!response.ok) return json({ results: [] });
    const body = JSON.parse(await readBoundedText(response)) as { data?: unknown };
    const rows = Array.isArray(body.data) ? body.data.slice(0, 20) : [];
    const results = rows.flatMap((value: unknown) => {
      if (!value || typeof value !== 'object') return [];
      const row = value as {
        title?: unknown;
        duration?: unknown;
        artist?: { name?: unknown; picture_medium?: unknown };
        album?: { title?: unknown };
      };
      const title = clean(row.title),
        artist = clean(row.artist?.name),
        album = clean(row.album?.title);
      if (!title || !artist) return [];
      const duration =
        typeof row.duration === 'number' && Number.isFinite(row.duration) && row.duration > 0
          ? row.duration
          : undefined;
      let artistArtworkUrl: string | undefined;
      try {
        const image = new URL(
          typeof row.artist?.picture_medium === 'string' ? row.artist.picture_medium : '',
        );
        if (
          image.protocol === 'https:' &&
          (image.hostname === 'cdns-images.dzcdn.net' ||
            image.hostname === 'e-cdns-images.dzcdn.net')
        )
          artistArtworkUrl = image.href;
      } catch {}
      return [
        {
          title,
          artist,
          album,
          ...(duration ? { duration } : {}),
          ...(artistArtworkUrl ? { artistArtworkUrl } : {}),
          provider: 'Deezer',
        },
      ];
    });
    return json({ results });
  } catch {
    return json({ results: [] });
  }
}

async function handleDownload(request: Request, platform: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ error: 'Method not allowed.' }, 405);
  const names =
    platform === 'windows'
      ? ['Wave.exe', 'Wave-Windows-x64-unsigned.zip']
      : platform === 'android'
        ? ['Wave.apk', 'Wave-Android-test-only.apk']
        : [];
  if (!names.length) return json({ error: 'Not found.' }, 404);
  try {
    const apiUrl = 'https://api.github.com/repos/jaime-gaming/Wave/releases?per_page=30';

    const edgeCache = (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)
      ?.default;
    const cacheKey = new Request(apiUrl);
    let response = await edgeCache?.match(cacheKey);
    if (!response) {
      response = await fetch(apiUrl, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'Wave-downloads' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error('Release unavailable');
      if (edgeCache) {
        const copy = response.clone();
        const headers = new Headers(copy.headers);
        headers.set('cache-control', 'public, max-age=300');
        try {
          await edgeCache.put(cacheKey, new Response(copy.body, { headers }));
        } catch {}
      }
    }
    const releases = (await response.json()) as Array<{
      draft?: boolean;
      prerelease?: boolean;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    }>;
    if (!Array.isArray(releases)) throw new Error('Invalid release list');
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const assets = Array.isArray(release.assets) ? release.assets : [];
      for (const name of names) {
        const asset = assets.find((item) => item.name === name);
        if (!asset?.browser_download_url) continue;
        const target = new URL(asset.browser_download_url);
        if (
          target.protocol !== 'https:' ||
          target.hostname !== 'github.com' ||
          !target.pathname.startsWith('/jaime-gaming/Wave/releases/download/') ||
          !target.pathname.endsWith(`/${encodeURIComponent(name)}`)
        )
          continue;
        return new Response(null, {
          status: 302,
          headers: { location: target.href, 'cache-control': 'no-store' },
        });
      }
    }
  } catch {}

  const fallback =
    platform === 'android'
      ? 'https://github.com/jaime-gaming/Wave/releases/download/v0.2.2/Wave.apk'
      : 'https://github.com/jaime-gaming/Wave/releases/download/v0.2.1/Wave-Windows-x64-unsigned.zip';
  return new Response(null, {
    status: 302,
    headers: { location: fallback, 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/download/'))
      return handleDownload(request, url.pathname.slice('/api/download/'.length));
    if (url.pathname === '/api/import-playlist') return handleImportPlaylist(request, url);
    if (url.pathname === '/api/youtube-meta') return handleYouTubeMeta(request, url);
    if (url.pathname === '/api/youtube-playlist') return handleYouTubePlaylist(request, url);
    if (url.pathname === '/api/youtube-search') return handleYouTubeSearch(request, url);
    if (url.pathname === '/api/deezer-search') return handleDeezerSearch(request, url);
    if (url.pathname === '/api/word-lyrics') return handleWordLyrics(request, url);
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
