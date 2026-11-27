import { Blob as NodeBlob } from 'node:buffer';
import { CompressionStream, DecompressionStream } from 'node:stream/web';
import { deflateSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { decodeSignal, encodeSignal, MAX_SIGNAL_CHARS } from './signal';

vi.stubGlobal('Blob', NodeBlob);
vi.stubGlobal('CompressionStream', CompressionStream);
vi.stubGlobal('DecompressionStream', DecompressionStream);
afterEach(() => vi.clearAllMocks());

it('round-trips a compressed signalling message', async () => {
  const value = { mode: 'offer', sdp: 'candidate\n'.repeat(200) };
  expect(await decodeSignal(await encodeSignal(value))).toEqual(value);
});

it('bounds the decompressed size and rejects malformed codes', async () => {
  const encoded = deflateSync(
    Buffer.from(JSON.stringify({ text: 'x'.repeat(MAX_SIGNAL_CHARS * 4) })),
  ).toString('base64url');
  await expect(decodeSignal(`wave1.d.${encoded}`)).rejects.toMatchObject({
    code: 'signal-too-large',
  });
  await expect(decodeSignal('wave1.p.AAAA.trailing')).rejects.toMatchObject({
    code: 'invalid-signal',
  });
});
