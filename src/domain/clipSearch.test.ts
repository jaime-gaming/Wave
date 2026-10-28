import { describe, expect, it } from 'vitest';
import {
  autoClipStart,
  clipQuery,
  parseInvidiousResults,
  parsePipedResults,
  pickClip,
  scoreClip,
  type ClipCandidate,
} from './clipSearch';

const song = { title: 'Midnight City', artist: 'M83', duration: 244 };
const candidate = (over: Partial<ClipCandidate> = {}): ClipCandidate => ({
  videoId: 'dX3k_QDnzHE',
  title: 'M83 - Midnight City (Official Video)',
  author: 'M83',
  duration: 244,
  ...over,
});

describe('clip search', () => {
  it('builds a compact query without duplicating the artist', () => {
    expect(clipQuery(song)).toBe('m83 midnight city');
    expect(clipQuery({ ...song, title: 'M83 Midnight City' })).toBe('m83 midnight city');
    expect(clipQuery({ ...song, artist: 'Unknown artist' })).toBe('midnight city');
  });

  it('prefers the upload whose length matches the song', () => {
    const wrongLength = candidate({
      videoId: 'aaaaaaaaaaa',
      title: 'M83 - Midnight City (Official Video)',
      duration: 1080,
    });
    expect(scoreClip(candidate(), song)).toBeGreaterThan(scoreClip(wrongLength, song));
    expect(pickClip([wrongLength, candidate()], song)?.videoId).toBe('dX3k_QDnzHE');
  });

  it('rejects covers, karaoke and reaction videos outright', () => {
    for (const title of [
      'Midnight City - M83 (Karaoke Version)',
      'Midnight City - M83 (Piano Cover)',
      'M83 Midnight City REACTION',
      'Midnight City (slowed + reverb)',
    ])
      expect(scoreClip(candidate({ title }), song)).toBe(0);
  });

  it('returns nothing when no candidate is convincing', () => {
    expect(pickClip([], song)).toBeNull();
    expect(
      pickClip([candidate({ title: 'Completely different song', author: 'Nobody' })], song),
    ).toBeNull();
    // A video id that is not eleven characters cannot be embedded.
    expect(pickClip([candidate({ videoId: 'short' })], song)).toBeNull();
  });

  it('works without a known song duration', () => {
    const unknown = { ...song, duration: 0 };
    expect(pickClip([candidate({ duration: 0, author: 'Some upload' })], unknown)?.videoId).toBe(
      'dX3k_QDnzHE',
    );
  });

  it('parses both provider shapes and skips unusable rows', () => {
    expect(
      parsePipedResults({
        items: [
          {
            url: '/watch?v=dX3k_QDnzHE',
            title: 'Midnight City',
            uploaderName: 'M83',
            duration: 244,
          },
          { url: '', title: 'Broken' },
          { url: '/watch?v=bad', title: 'Short id' },
        ],
      }),
    ).toEqual([{ videoId: 'dX3k_QDnzHE', title: 'Midnight City', author: 'M83', duration: 244 }]);
    expect(
      parseInvidiousResults([
        {
          type: 'video',
          videoId: 'dX3k_QDnzHE',
          title: 'Midnight City',
          author: 'M83',
          lengthSeconds: 244,
        },
        { type: 'playlist', playlistId: 'PL1234567890' },
        { type: 'video', videoId: 'nope', title: 'Nope' },
      ]),
    ).toEqual([{ videoId: 'dX3k_QDnzHE', title: 'Midnight City', author: 'M83', duration: 244 }]);
    expect(parsePipedResults(null)).toEqual([]);
    expect(parseInvidiousResults({})).toEqual([]);
  });
});

describe('autoClipStart', () => {
  it('splits the extra length of the upload, keeping the larger part at the start', () => {
    // A 30 s title card on a 240 s song: start 18 s in, which is where the music is.
    expect(autoClipStart(270, 240)).toBe(18);
    // Anything within two seconds is noise, not an intro.
    expect(autoClipStart(242, 240)).toBe(0);
    expect(autoClipStart(240, 240)).toBe(0);
  });

  it('never guesses wildly or divides by zero', () => {
    expect(autoClipStart(3_600, 60)).toBe(60);
    expect(autoClipStart(0, 240)).toBe(0);
    expect(autoClipStart(240, 0)).toBe(0);
    expect(autoClipStart(Number.NaN, 240)).toBe(0);
    // A short clip inside a long song is not a start problem.
    expect(autoClipStart(200, 400)).toBe(0);
  });
});
