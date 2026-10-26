import { describe, expect, it } from 'vitest';
import { parseImportLink, PROVIDER_LIMITS, targetLabel } from './linkImport';

const SPOTIFY_ID = '37i9dQZF1DXcBWIGoYBM5M';

describe('import links', () => {
  it('reads Spotify playlist, album and track links', () => {
    expect(parseImportLink(`https://open.spotify.com/playlist/${SPOTIFY_ID}?si=abc`)).toEqual({
      ok: true,
      target: { provider: 'spotify', kind: 'playlist', id: SPOTIFY_ID },
    });
    expect(parseImportLink(`open.spotify.com/intl-es/album/${SPOTIFY_ID}`)).toMatchObject({
      target: { kind: 'album' },
    });
    expect(parseImportLink(`https://open.spotify.com/track/${SPOTIFY_ID}`)).toMatchObject({
      target: { kind: 'track' },
    });
    expect(parseImportLink(`spotify:playlist:${SPOTIFY_ID}`)).toMatchObject({
      target: { provider: 'spotify', kind: 'playlist' },
    });
    expect(parseImportLink(`spotify:user:someone:playlist:${SPOTIFY_ID}`)).toMatchObject({
      target: { kind: 'playlist', id: SPOTIFY_ID },
    });
  });

  it('reads YouTube playlist and video links', () => {
    expect(parseImportLink('https://www.youtube.com/playlist?list=PLabc123456')).toEqual({
      ok: true,
      target: { provider: 'youtube', kind: 'playlist', id: 'PLabc123456' },
    });
    expect(parseImportLink('https://youtu.be/dQw4w9WgXcQ?list=PLabc123456')).toEqual({
      ok: true,
      target: {
        provider: 'youtube',
        kind: 'video',
        id: 'dQw4w9WgXcQ',
        playlistId: 'PLabc123456',
      },
    });
  });

  it('explains why a link cannot be used', () => {
    expect(parseImportLink('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseImportLink('https://example.com/playlist/x')).toMatchObject({
      reason: 'unsupported-host',
    });
    expect(parseImportLink('https://open.spotify.com/user/someone')).toMatchObject({
      reason: 'unsupported-kind',
    });
    expect(parseImportLink('https://open.spotify.com/playlist/tooshort')).toMatchObject({
      reason: 'invalid-id',
    });
    expect(parseImportLink('https://open.spotify.com/playlist/local')).toMatchObject({
      reason: 'local-file',
    });
    expect(parseImportLink('https://spotify.link/abc123')).toMatchObject({ reason: 'short-link' });
  });

  it('describes provider limits in user-facing language', () => {
    expect(targetLabel({ provider: 'youtube', kind: 'playlist', id: 'x' })).toBe(
      'YouTube playlist',
    );
    expect(PROVIDER_LIMITS.spotify.limitation).toMatch(/never downloads Spotify audio/);
    expect(PROVIDER_LIMITS.youtube.limitation).toMatch(/embedded player/);
  });
});
