import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXTENDED_LYRICS_KEY,
  extendedLyricsEnabled,
  fetchWordLyrics,
  setExtendedLyrics,
} from './lyricsExtra';
import {
  parseKugouCandidates,
  parseNetEaseSongs,
  parseClock,
  pickProviderSong,
} from '../domain/wordProviders';

const track = { title: 'Midnight City', artist: 'M83', duration: 244 };

const netEaseSearch = {
  result: { songs: [{ id: 111, name: 'Midnight City', ar: [{ name: 'M83' }], dt: 244_000 }] },
};
const netEaseLyric = {
  yrc: {
    lyric: '[0,2000,0](0,500,0)Mid (500,500,0)night (1000,500,0)City',
  },
};
const kugouSearch = {
  candidates: [
    {
      id: 'abc',
      accesskey: 'key',
      song: 'Midnight City',
      singer: 'M83',
      duration: '04:04',
    },
  ],
};
const kugouPayload = (() => {
  const key = [
    0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
  ];
  const body = '[0,2000]<0,500,0>Mid <500,500,0>night';
  const plain = new Uint8Array(4 + body.length);
  plain.set([0x6b, 0x72, 0x63, 0x31]);
  for (let index = 0; index < body.length; index++) plain[4 + index] = body.charCodeAt(index);
  const bytes = plain.map((byte, index) => byte ^ key[index % key.length]);
  return { fmt: 'krc', content: btoa(String.fromCharCode(...bytes)) };
})();

const responder = (map: Record<string, unknown>) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(map).find((fragment) => url.includes(fragment));
    return {
      ok: !!match,
      json: async () => (match ? map[match] : {}),
    } as Response;
  });

beforeEach(() => localStorage.clear());

describe('word-level lyric providers', () => {
  it('prefers NetEase YRC and returns real word timings', async () => {
    const fetcher = responder({
      'music.163.com/api/search': netEaseSearch,
      'song/lyric': netEaseLyric,
    });
    const result = await fetchWordLyrics(track, { fetcher });
    expect(result?.provider).toBe('netease');
    expect(result?.wordLevel).toBe(true);
    expect(result?.lines[0].words).toHaveLength(3);
    expect(result?.lines[0].words?.[1]).toMatchObject({ text: 'night ', time: 0.5 });
  });

  it('falls back to Kugou when NetEase has nothing usable', async () => {
    const fetcher = responder({
      'music.163.com/api/search': { result: { songs: [] } },
      'krcs.kugou.com/search': kugouSearch,
      'lyrics.kugou.com/download': kugouPayload,
    });
    const result = await fetchWordLyrics(track, { fetcher });
    expect(result?.provider).toBe('kugou');
    expect(result?.lines[0].text).toBe('Mid night');
    expect(result?.wordLevel).toBe(true);
  });

  it('returns nothing rather than a different recording', async () => {
    const fetcher = responder({
      'music.163.com/api/search': {
        result: { songs: [{ id: 9, name: 'Midnight City (Live)', ar: [{ name: 'M83' }] }] },
      },
      'krcs.kugou.com/search': { candidates: [] },
    });
    expect(await fetchWordLyrics(track, { fetcher })).toBeUndefined();
  });

  it('survives timeouts and blocked networks', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('blocked'));
    expect(await fetchWordLyrics(track, { fetcher })).toBeUndefined();
    const slow = vi.fn(() => new Promise<Response>(() => undefined));
    expect(
      await fetchWordLyrics(track, { fetcher: slow as unknown as typeof fetch, timeoutMs: 10 }),
    ).toBeUndefined();
  });

  it('is an opt-in setting that stays off by default', () => {
    expect(extendedLyricsEnabled()).toBe(false);
    setExtendedLyrics(true);
    expect(extendedLyricsEnabled()).toBe(true);
    expect(localStorage.getItem(EXTENDED_LYRICS_KEY)).toBe('true');
    setExtendedLyrics(false);
    expect(extendedLyricsEnabled()).toBe(false);
  });

  it('parses provider payloads defensively', () => {
    expect(parseNetEaseSongs(netEaseSearch)[0]).toEqual({
      id: '111',
      title: 'Midnight City',
      artist: 'M83',
      duration: 244,
    });
    expect(parseNetEaseSongs({})).toEqual([]);
    expect(parseKugouCandidates(kugouSearch)[0]).toMatchObject({ id: 'abc', accessKey: 'key' });
    expect(parseKugouCandidates(null)).toEqual([]);
    expect(parseClock('04:04')).toBe(244);
    expect(parseClock('4:4')).toBe(0);
    expect(parseClock(200)).toBe(200);
    expect(
      pickProviderSong(
        [
          { id: '1', title: 'Other song', artist: 'M83', duration: 200 },
          { id: '2', title: 'Midnight City', artist: 'M83', duration: 244 },
        ],
        track,
      )?.id,
    ).toBe('2');
  });
});
