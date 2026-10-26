import { parseYouTubeLink } from './youtube';

/**
 * Reading a playlist link never downloads audio. Wave only asks providers for
 * public metadata (title, artist, duration) and then matches it against the
 * collection already stored on the device.
 */
export type LinkProvider = 'spotify' | 'youtube';
export type LinkKind = 'playlist' | 'album' | 'track' | 'video' | 'artist';

export interface ImportTarget {
  provider: LinkProvider;
  kind: LinkKind;
  id: string;
  /** YouTube videos keep their parent playlist when the link contains one. */
  playlistId?: string;
}
export type LinkProblem =
  'empty' | 'unsupported-host' | 'unsupported-kind' | 'invalid-id' | 'short-link' | 'local-file';

export type LinkParse =
  { ok: true; target: ImportTarget } | { ok: false; reason: LinkProblem; message: string };

const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/u;
const SPOTIFY_KINDS: Record<string, LinkKind> = {
  playlist: 'playlist',
  album: 'album',
  track: 'track',
  artist: 'artist',
};

const PROBLEMS: Record<LinkProblem, string> = {
  empty: 'Paste a Spotify or YouTube playlist link.',
  'unsupported-host': 'Only Spotify and YouTube links are supported.',
  'unsupported-kind':
    'Use a Spotify playlist, album or song link, or a YouTube playlist or video link.',
  'invalid-id': 'That link does not contain a valid Spotify or YouTube identifier.',
  'short-link':
    'Short links cannot be read directly. Open the link in a browser and copy the full address.',
  'local-file': 'Local Spotify files are stored on your computer and cannot be read by Wave.',
};

const fail = (reason: LinkProblem): LinkParse => ({ ok: false, reason, message: PROBLEMS[reason] });

/** `spotify:playlist:37i9…` and `spotify:user:name:playlist:37i9…` URIs. */
function parseSpotifyUri(text: string): LinkParse | null {
  if (!/^spotify:/iu.test(text)) return null;
  const parts = text.split(':').filter(Boolean);
  const kind = parts.length >= 3 ? parts[parts.length - 2] : '';
  const id = parts[parts.length - 1] ?? '';
  if (!SPOTIFY_KINDS[kind]) return fail('unsupported-kind');
  if (!SPOTIFY_ID.test(id)) return fail('invalid-id');
  return { ok: true, target: { provider: 'spotify', kind: SPOTIFY_KINDS[kind], id } };
}

/** Spotify links may carry a locale prefix (`/intl-es/…`) and tracking queries. */
function parseSpotifyUrl(url: URL): LinkParse | null {
  const host = url.hostname.toLowerCase();
  if (host === 'spotify.link' || host === 'spotify.app.link') return fail('short-link');
  if (host !== 'open.spotify.com' && host !== 'play.spotify.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const withoutLocale = segments[0]?.startsWith('intl-') ? segments.slice(1) : segments;
  const kind = withoutLocale[0] ?? '';
  const id = withoutLocale[1] ?? '';
  if (withoutLocale.includes('local')) return fail('local-file');
  if (!SPOTIFY_KINDS[kind]) return fail('unsupported-kind');
  if (!SPOTIFY_ID.test(id)) return fail('invalid-id');
  return { ok: true, target: { provider: 'spotify', kind: SPOTIFY_KINDS[kind], id } };
}

export function parseImportLink(raw: string): LinkParse {
  const text = raw.trim();
  if (!text) return fail('empty');
  const shotifyUri = parseSpotifyUri(text);
  if (shotifyUri) return shotifyUri;
  const youtube = parseYouTubeLink(text);
  if (youtube)
    return youtube.kind === 'video'
      ? {
          ok: true,
          target: {
            provider: 'youtube',
            kind: 'video',
            id: youtube.videoId,
            ...(youtube.playlistId ? { playlistId: youtube.playlistId } : {}),
          },
        }
      : { ok: true, target: { provider: 'youtube', kind: 'playlist', id: youtube.playlistId } };
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//iu.test(text) ? text : `https://${text}`);
  } catch {
    return fail('invalid-id');
  }
  const spotify = parseSpotifyUrl(url);
  if (spotify) return spotify;
  return fail('unsupported-host');
}

export interface ProviderLimits {
  /** Metadata that the provider can return for a link the user pasted. */
  metadata: string;
  /** What Wave explicitly will not do with the link. */
  limitation: string;
}

export const PROVIDER_LIMITS: Record<LinkProvider, ProviderLimits> = {
  spotify: {
    metadata: 'Song titles, artists, albums and durations of playlists you own or collaborate on.',
    limitation:
      'Spotify playlists owned by other accounts can no longer be read by new applications, and Wave never downloads Spotify audio.',
  },
  youtube: {
    metadata: 'Public YouTube playlist titles, video titles, channels and durations.',
    limitation:
      'YouTube links are played with the official embedded player; Wave does not extract or store their audio.',
  },
};

export function providerLabel(provider: LinkProvider): string {
  return provider === 'spotify' ? 'Spotify' : 'YouTube';
}

export function targetLabel(target: ImportTarget): string {
  return `${providerLabel(target.provider)} ${target.kind}`;
}
