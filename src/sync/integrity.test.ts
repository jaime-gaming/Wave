import { describe, expect, it } from 'vitest';
import {
  audioKind,
  identicalBytes,
  loanQualityNote,
  requiresExactCopy,
  verifyCopy,
  wrapWav24,
} from './integrity';

const encoder = new TextEncoder();

async function digest(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('audio integrity', () => {
  it('classifies lossless and lossy sources without assuming', () => {
    expect(audioKind('Song.FLAC')).toBe('lossless');
    expect(audioKind('mix.wav')).toBe('lossless');
    expect(audioKind('song.mp3')).toBe('lossy');
    // M4A may be AAC or ALAC, so it is never claimed to be lossless.
    expect(audioKind('song.m4a')).toBe('lossy');
    expect(audioKind('file')).toBe('unknown');
    expect(requiresExactCopy('song.flac')).toBe(true);
    expect(requiresExactCopy('song.opus')).toBe(false);
    expect(loanQualityNote('song.flac')).toMatch(/byte for byte/);
    expect(loanQualityNote('song.flac')).toMatch(/no re-encoding, no resampling/);
    expect(loanQualityNote('song.mp3')).toMatch(/no bitrate change/);
  });

  it('accepts an exact copy and rejects every kind of corruption', async () => {
    const original = wrapWav24(44100, 24, 2, 120);
    const sha256 = await digest(original);
    expect(await verifyCopy(original, { size: original.byteLength, sha256 })).toEqual({
      ok: true,
      size: original.byteLength,
      sha256,
    });

    const truncated = original.slice(0, original.byteLength - 1);
    expect(await verifyCopy(truncated, { size: original.byteLength, sha256 })).toMatchObject({
      ok: false,
      reason: 'size-mismatch',
    });

    const altered = original.slice();
    altered[200] = altered[200] ^ 1;
    expect(await verifyCopy(altered, { size: original.byteLength, sha256 })).toMatchObject({
      ok: false,
      reason: 'digest-mismatch',
    });

    expect(await verifyCopy(new Uint8Array(), { size: 0, sha256 })).toMatchObject({
      reason: 'empty',
    });
    expect(await verifyCopy(original, { size: original.byteLength, sha256: 'nope' })).toMatchObject(
      {
        reason: 'no-hash',
      },
    );
    expect(await verifyCopy(original, { size: 300 * 1024 * 1024, sha256 })).toMatchObject({
      reason: 'too-large',
    });
    expect(await verifyCopy(original, { size: -1, sha256 })).toMatchObject({
      reason: 'size-mismatch',
    });
  });

  it('compares large buffers exactly, including single-bit changes', () => {
    const left = wrapWav24(48000, 24, 2, 60);
    expect(identicalBytes(left, left.slice())).toBe(true);
    const changed = left.slice();
    changed[changed.byteLength - 1] ^= 1;
    expect(identicalBytes(left, changed)).toBe(false);
    expect(identicalBytes(left, left.slice(0, 10))).toBe(false);
  });

  it('produces a real 24-bit PCM fixture whose maximum sample is untouched', () => {
    const fixture = wrapWav24(44100, 24, 1, 10);
    // 44-byte header plus three bytes per sample.
    expect(fixture.byteLength).toBe(44 + 44100 * 10 * 3);
    expect(String.fromCharCode(...fixture.slice(0, 4))).toBe('RIFF');
    const header = new DataView(fixture.buffer, fixture.byteOffset);
    expect(header.getUint16(34, true)).toBe(24);
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint32(24, true)).toBe(44100);
    // The first sample sits at the 24-bit ceiling, so any bit-depth reduction
    // would be visible in the data itself, not only in the header.
    expect([fixture[44], fixture[45], fixture[46]]).toEqual([0xff, 0xff, 0x7f]);
    expect(fixture.slice(47).every((byte) => byte === 0)).toBe(true);
  });

  it('keeps non-ASCII artwork-free payloads byte identical', async () => {
    const payload = encoder.encode(
      'ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000' + 'ñ'.repeat(64),
    );
    const sha256 = await digest(payload);
    expect(await verifyCopy(payload, { size: payload.byteLength, sha256 })).toMatchObject({
      ok: true,
    });
  });
});
