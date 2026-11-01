import type { CatalogueRelease } from '../domain/catalogue';

/**
 * Asking a public catalogue what a file probably is.
 *
 * The provider is Apple's iTunes Search API: it answers without a key, allows
 * cross-origin requests, and returns title, artist, album, year, genre, running
 * time and a cover for the same recording. Wave sends the artist and title it
 * already has and nothing else — no audio, no identifiers, no account — and the
 * answer is used to *fill gaps*, never to correct a tag the listener set.
 *
 * A failed or slow lookup is not an error the interface needs to explain: the
 * song simply stays as complete as it already was.
 */
export const CATALOGUE_ROOT = 'https://itunes.apple.com';
export const CATALOGUE_TIMEOUT_MS = 7_000;
export const CATALOGUE_RESULT_LIMIT = 8;

interface ItunesTrack {
  trackName?: unknown;
  artistName?: unknown;
  collectionName?: unknown;
  releaseDate?: unknown;
  primaryGenreName?: unknown;
  trackTimeMillis?: unknown;
  artworkUrl100?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function year(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  // iTunes dates are ISO strings; MusicBrainz-style years also pass through here.
  const match = raw.match(/^(\d{4})/u);
  const parsed = match ? Number(match[1]) : Number(raw);
  return Number.isFinite(parsed) && parsed > 1000 ? parsed : undefined;
}

/** `100x100bb.jpg` is the thumbnail; `600x600bb.jpg` is the sleeve. */
function cover(value: unknown): string | undefined {
  const url = text(value);
  if (!url.startsWith('https://')) return undefined;
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/u, '/600x600bb.$1');
}

export function parseCatalogueResults(payload: unknown): CatalogueRelease[] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const releases: CatalogueRelease[] = [];
  for (const entry of results as ItunesTrack[]) {
    const title = text(entry.trackName);
    const artist = text(entry.artistName);
    if (!title || !artist) continue;
    const milliseconds = Number(entry.trackTimeMillis);
    const artworkUrl = cover(entry.artworkUrl100);
    const genre = text(entry.primaryGenreName);
    const released = year(entry.releaseDate);
    releases.push({
      title,
      artist,
      album: text(entry.collectionName),
      ...(released ? { year: released } : {}),
      ...(genre ? { genre } : {}),
      ...(Number.isFinite(milliseconds) && milliseconds > 0
        ? { duration: Math.round(milliseconds / 1000) }
        : {}),
      ...(artworkUrl ? { artworkUrl } : {}),
    });
  }
  return releases;
}

/** One question, bounded in time, answering an empty list when anything goes wrong. */
export async function searchCatalogue(
  term: string,
  options: { signal?: AbortSignal; country?: string } = {},
): Promise<CatalogueRelease[]> {
  const query = term.trim();
  if (!query) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, CATALOGUE_TIMEOUT_MS);
  try {
    // `country` is the storefront, and it is the listener's own where the
    // browser says so: a Spanish release and its American edition differ.
    const country = (options.country ?? 'US').toUpperCase().slice(0, 2);
    const url = `${CATALOGUE_ROOT}/search?${new URLSearchParams({
      term: query,
      entity: 'song',
      limit: String(CATALOGUE_RESULT_LIMIT),
      country,
    })}`;
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return [];
    }
    return parseCatalogueResults(JSON.parse(await response.text()));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** Fetches a cover and hands it over as a `File`, ready for `readArtwork`. */
export async function downloadCover(url: string, signal?: AbortSignal): Promise<File | undefined> {
  if (!url.startsWith('https://')) return undefined;
  try {
    const response = await fetch(url, {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return undefined;
    }
    const blob = await response.blob();
    if (!blob.size || blob.size > 6 * 1024 * 1024) return undefined;
    const extension = blob.type === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `cover.${extension}`, { type: blob.type || 'image/jpeg' });
  } catch {
    return undefined;
  }
}

/** The listener's storefront, when the browser is willing to say. */
export function preferredCountry(locale = globalThis.navigator?.language): string {
  const region = (locale ?? '').split('-')[1];
  return /^[A-Za-z]{2}$/u.test(region ?? '') ? region!.toUpperCase() : 'US';
}
