import { parseImportLink } from '../domain/linkImport';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const MAX_BYTES = 2_000_000;
const MAX_TRACKS = 500;
const clean = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .replace(/[\r\n]/gu, ' ')
        .trim()
        .slice(0, 500)
    : '';
const label = (value: unknown): string => {
  if (!value || typeof value !== 'object') return clean(value);
  const obj = value as Record<string, unknown>;
  if (typeof obj.simpleText === 'string') return clean(obj.simpleText);
  return Array.isArray(obj.runs)
    ? obj.runs.map((run) => clean((run as Record<string, unknown>).text)).join('')
    : '';
};

/** Public page data only; never execute provider scripts or request accounts/audio. */
export function publicPlaylistText(html: string): string {
  const roots: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*(?:id="__NEXT_DATA__"|type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gu,
  )) {
    try {
      roots.push(JSON.parse(match[1]));
    } catch {
      /* Not public JSON. */
    }
  }
  const marker = /(?:var\s+ytInitialData\s*=|window\["ytInitialData"\]\s*=)\s*/u.exec(html);
  if (marker) {
    const start = marker.index + marker[0].length;
    // JSON is embedded in a script; find its closing brace without trusting HTML.
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          roots.push(JSON.parse(html.slice(start, i + 1)));
        } catch {
          /* Provider changed. */
        }
        break;
      }
    }
  }
  const entries: { title: string; artist: string }[] = [];
  let nodes = 0;
  const walk = (node: unknown, depth = 0) => {
    if (
      !node ||
      typeof node !== 'object' ||
      depth > 35 ||
      ++nodes > 30_000 ||
      entries.length >= MAX_TRACKS
    )
      return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj.playlistVideoRenderer && typeof obj.playlistVideoRenderer === 'object') {
      const row = obj.playlistVideoRenderer as Record<string, unknown>;
      const title = label(row.title),
        artist = label(row.shortBylineText);
      if (title && artist) entries.push({ title, artist });
      return;
    }
    if (Array.isArray(obj.trackList)) {
      for (const item of obj.trackList.slice(0, MAX_TRACKS)) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const title = clean(row.title),
          artist = clean(row.subtitle);
        if (title && artist) entries.push({ title, artist });
      }
      return;
    }
    if (obj['@type'] === 'MusicRecording') {
      const by = obj.byArtist as Record<string, unknown> | undefined;
      const title = clean(obj.name),
        artist = clean(by?.name);
      if (title && artist) entries.push({ title, artist });
      return;
    }
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  roots.forEach((root) => walk(root));
  // CSV preserves the title and artist as separate fields, including punctuation.
  const csv = (value: string) => '"' + value.replace(/"/gu, '""') + '"';
  return entries.length
    ? 'title,artist\n' + entries.map((e) => `${csv(e.title)},${csv(e.artist)}`).join('\n')
    : '';
}

async function boundedText(response: Pick<Response, 'body' | 'headers'>): Promise<string> {
  if (!response.body || Number(response.headers.get('content-length')) > MAX_BYTES)
    throw new Error('too large');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('too large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/import-playlist')
      return url.pathname.startsWith('/api/')
        ? json({ error: 'Not found.' }, 404)
        : env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (request.headers.get('origin') !== url.origin)
      return json({ error: 'Same-origin requests only.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: 'Use JSON.' }, 415);
    let raw: string;
    try {
      raw = await boundedText(request);
    } catch {
      return json({ error: 'Request too large.' }, 413);
    }
    let link: unknown;
    try {
      link = (JSON.parse(raw) as { url?: unknown }).url;
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    if (typeof link !== 'string' || link.length > 2048)
      return json({ error: 'Invalid link.' }, 400);
    const parsed = parseImportLink(link);
    if (!parsed.ok) return json({ error: parsed.message }, 400);
    const { target } = parsed;
    if (target.provider === 'spotify' && target.kind === 'artist')
      return json({ error: 'Use a playlist or album link.' }, 422);
    // Canonical fixed upstreams, no user-controlled host or redirects (SSRF).
    const upstream =
      target.provider === 'spotify'
        ? `https://open.spotify.com/embed/${target.kind}/${target.id}`
        : target.kind === 'playlist' || target.playlistId
          ? `https://www.youtube.com/playlist?list=${encodeURIComponent(target.playlistId ?? target.id)}&hl=en`
          : `https://www.youtube.com/watch?v=${encodeURIComponent(target.id)}&hl=en`;
    try {
      const response = await fetch(upstream, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error('unavailable');
      const text = publicPlaylistText(await boundedText(response));
      if (!text)
        return json(
          { error: 'No public song list was available. Try an exported file instead.' },
          422,
        );
      return json({ text, partial: true });
    } catch {
      return json({ error: 'The provider could not be read. Try an exported file instead.' }, 502);
    }
  },
};
