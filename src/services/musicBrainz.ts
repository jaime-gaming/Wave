import type { CatalogueRelease } from '../domain/catalogue';

let nextRequestAt = 0;
export function parseMusicBrainz(payload: unknown): CatalogueRelease[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as { recordings?: unknown }).recordings;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 20).flatMap((row): CatalogueRelease[] => {
    if (!row || typeof row !== 'object') return [];
    const record = row as {
      title?: unknown;
      length?: unknown;
      'artist-credit'?: unknown;
      releases?: unknown;
      'first-release-date'?: unknown;
    };
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const credits = Array.isArray(record['artist-credit']) ? record['artist-credit'] : [];
    const artist = credits
      .map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const credit = part as {
          name?: unknown;
          artist?: { name?: unknown };
          joinphrase?: unknown;
        };
        const name =
          typeof credit.name === 'string'
            ? credit.name
            : typeof credit.artist?.name === 'string'
              ? credit.artist.name
              : '';
        return name + (typeof credit.joinphrase === 'string' ? credit.joinphrase : '');
      })
      .join('')
      .trim();
    if (!title || !artist) return [];
    const release =
      Array.isArray(record.releases) && record.releases[0] && typeof record.releases[0] === 'object'
        ? (record.releases[0] as { title?: unknown; date?: unknown })
        : undefined;
    const date =
      typeof release?.date === 'string'
        ? release.date
        : typeof record['first-release-date'] === 'string'
          ? record['first-release-date']
          : '';
    const year = /^\d{4}/u.test(date) ? Number(date.slice(0, 4)) : undefined;
    const ms =
      typeof record.length === 'number' && Number.isFinite(record.length) && record.length > 0
        ? record.length
        : undefined;
    return [
      {
        title,
        artist,
        album: typeof release?.title === 'string' ? release.title : '',
        ...(year ? { year } : {}),
        ...(ms ? { duration: Math.round(ms / 1000) } : {}),
        provider: 'MusicBrainz',
      },
    ];
  });
}

export async function searchMusicBrainz(
  raw: string,
  signal?: AbortSignal,
): Promise<CatalogueRelease[]> {
  const words =
    raw
      .slice(0, 200)
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 16) ?? [];
  if (!words.length || signal?.aborted) return [];

  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + 1100;
  if (wait) await new Promise<void>((resolve) => setTimeout(resolve, wait));
  if (signal?.aborted) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 5000);
  try {
    const url = `https://musicbrainz.org/ws/2/recording/?${new URLSearchParams({ query: words.join(' AND '), fmt: 'json', limit: '20' })}`;
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const body = await response.text();
    if (body.length > 1_000_000) return [];
    return parseMusicBrainz(JSON.parse(body));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function searchDeezer(raw: string, signal?: AbortSignal): Promise<CatalogueRelease[]> {
  const query = raw.trim().slice(0, 200);
  if (query.length < 2 || signal?.aborted) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 5500);
  try {
    const response = await fetch('/api/deezer-search', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray((data as { results?: unknown }).results)
    )
      return [];
    return (data as { results: unknown[] }).results
      .slice(0, 20)
      .flatMap((entry): CatalogueRelease[] => {
        if (!entry || typeof entry !== 'object') return [];
        const value = entry as {
          title?: unknown;
          artist?: unknown;
          album?: unknown;
          duration?: unknown;
          artistArtworkUrl?: unknown;
        };
        if (
          typeof value.title !== 'string' ||
          !value.title ||
          typeof value.artist !== 'string' ||
          !value.artist
        )
          return [];
        return [
          {
            title: value.title,
            artist: value.artist,
            album: typeof value.album === 'string' ? value.album : '',
            ...(typeof value.duration === 'number' &&
            Number.isFinite(value.duration) &&
            value.duration > 0
              ? { duration: value.duration }
              : {}),
            ...(typeof value.artistArtworkUrl === 'string' &&
            /^https:\/\/(?:e-)?cdns-images\.dzcdn\.net\//u.test(value.artistArtworkUrl)
              ? { artistArtworkUrl: value.artistArtworkUrl }
              : {}),
            provider: 'Deezer',
          },
        ];
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
