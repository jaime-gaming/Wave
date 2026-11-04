import { describe, expect, it } from 'vitest';
import {
  decodeKrc,
  hasWordTimings,
  headerOffsetMs,
  lyricText,
  parseKrc,
  parseYrc,
  wordTimelinePlausible,
} from './wordLyrics';

const YRC = [
  '[0,800,0](0,200,0)We (200,200,0)were (400,400,0)young',
  '[900,600,0](900,300,0)Running (1200,300,0)away',
].join('\n');

describe('word-level lyric formats', () => {
  it('reads NetEase YRC into lines with real word stamps', () => {
    const lines = parseYrc(YRC);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('We were young');
    expect(lines[0].time).toBe(0);
    expect(lines[0].words).toEqual([
      { text: 'We ', time: 0, end: 0.2 },
      { text: 'were ', time: 0.2, end: 0.4 },
      { text: 'young', time: 0.4, end: 0.8 },
    ]);
    expect(lines[1].words?.at(-1)).toMatchObject({ text: 'away', time: 1.2 });
    expect(hasWordTimings(lines)).toBe(true);
  });

  it('keeps a plain YRC line without inventing word timings', () => {
    const [line] = parseYrc('[5000,1000,0]Just a line');
    expect(line).toEqual({ text: 'Just a line', time: 5 });
  });

  it('drops word stamps that run backwards', () => {
    const [line] = parseYrc('[0,900,0](500,200,0)Late (100,200,0)Early');
    expect(line.text).toBe('Late Early');
    expect(line.words).toBeUndefined();
  });

  it('reads Kugou KRC after decoding, including its four-byte header', () => {
    const plain = '[0,800]<0,200,0>We <200,200,0>were <400,400,0>young';
    expect(parseKrc(plain)[0]).toMatchObject({
      text: 'We were young',
      time: 0,
      words: [
        { text: 'We ', time: 0, end: 0.2 },
        { text: 'were ', time: 0.2, end: 0.4 },
        { text: 'young', time: 0.4, end: 0.8 },
      ],
    });
    expect(parseKrc(plain)[0].words).toHaveLength(3);
  });

  it('decodes the XOR-obfuscated payload and refuses to guess on junk', () => {
    // Build a payload the way the provider does: header + XOR + base64.
    const key = [
      0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e,
      0x69,
    ];
    const body = '[0,500]<0,200,0>Hi';
    const plainBytes = new Uint8Array(4 + body.length);
    plainBytes.set([0x6b, 0x72, 0x63, 0x31]);
    for (let index = 0; index < body.length; index++)
      plainBytes[4 + index] = body.charCodeAt(index);
    // The provider XORs the whole payload, header included, then base64s it.
    const bytes = plainBytes.map((byte, index) => byte ^ key[index % key.length]);
    const encoded = btoa(String.fromCharCode(...bytes));
    expect(decodeKrc(encoded)).toBe(body);
    expect(decodeKrc('')).toBe('');
  });

  it('only trusts timings that fit the song', () => {
    const lines = parseYrc(YRC);
    expect(wordTimelinePlausible(lines, 200)).toBe(true);
    // Lyrics that run minutes past the file are not trusted.
    expect(wordTimelinePlausible(lines, 0.5)).toBe(true);
    expect(
      wordTimelinePlausible(parseYrc('[400000,1000,0](400000,1000,0)Far past the end'), 100),
    ).toBe(false);
    expect(wordTimelinePlausible([], 200)).toBe(false);
    expect(
      wordTimelinePlausible(
        [
          { text: 'x', time: 5 },
          { text: 'y', time: 2 },
        ],
        200,
      ),
    ).toBe(false);
    expect(hasWordTimings(parseYrc('[0,500,0]Plain'))).toBe(false);
  });

  it('reads the provider offset and produces plain text when asked', () => {
    expect(headerOffsetMs('[offset:250]\n[0,500]<0,200,0>Hi')).toBe(250);
    expect(headerOffsetMs('nothing here')).toBe(0);
    expect(headerOffsetMs('[offset:99999]')).toBe(0);
    expect(lyricText(parseYrc(YRC))).toBe('We were young\nRunning away');
  });
});
