import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decodeFrame,
  encodeFrame,
  frameBytes,
  MAX_FRAME_BYTES,
  paginateLibraryIndex,
  planTransfer,
  sha256Hex,
  SyncError,
  TransferAssembler,
  TransferSender,
  type LibraryEntry,
  type SyncFrame,
} from './protocol';

const SHA = 'a'.repeat(64);
const bytes = (size: number) => Uint8Array.from({ length: size }, (_, index) => index % 251);

describe('sync protocol frames', () => {
  it('round-trips every supported frame', () => {
    const frames: SyncFrame[] = [
      {
        type: 'hello',
        deviceId: 'device-1234',
        name: 'Pixel',
        platform: 'android',
        protocolVersion: 1,
        publicKey: 'BFake',
      },
      { type: 'pair-confirm', sas: '123456' },
      { type: 'pair-reject', reason: 'Declined' },
      {
        type: 'library-index',
        complete: true,
        entries: [
          {
            trackId: 't1',
            title: 'Song',
            artist: 'Artist',
            album: 'Album',
            duration: 200,
            size: 4096,
          },
        ],
      },
      {
        type: 'loan-offer',
        requests: [{ loanId: 'l1', trackId: 't1', deviceId: 'd1', size: 4096, pinned: true }],
      },
      { type: 'loan-accept', loanIds: ['l1'] },
      { type: 'loan-decline', loanIds: ['l1'], reason: 'No space' },
      {
        type: 'transfer-start',
        loanId: 'l1',
        trackId: 't1',
        size: 100,
        sha256: SHA,
        chunkSize: 48,
        chunkCount: 3,
      },
      { type: 'transfer-chunk', loanId: 'l1', index: 0, data: 'AAAA' },
      { type: 'transfer-complete', loanId: 'l1', sha256: SHA },
      { type: 'transfer-abort', loanId: 'l1', reason: 'Cancelled' },
      { type: 'revoke-loan', loanId: 'l1' },
      { type: 'ping', at: 5 },
      { type: 'pong', at: 5 },
      { type: 'error', code: 'timeout', message: 'Pairing expired' },
    ];
    for (const frame of frames) {
      expect(decodeFrame(encodeFrame(frame))).toEqual({ ok: true, frame });
    }
  });

  it('rejects hostile or unsupported frames', () => {
    expect(decodeFrame('not json')).toMatchObject({ ok: false, code: 'invalid-json' });
    expect(decodeFrame('[]')).toMatchObject({ ok: false, code: 'invalid-json' });
    expect(decodeFrame(JSON.stringify({ v: 2, type: 'ping', at: 1 }))).toMatchObject({
      code: 'unsupported-version',
    });
    expect(decodeFrame(JSON.stringify({ v: 1, type: 'self-destruct' }))).toMatchObject({
      code: 'unknown-type',
    });
    expect(
      decodeFrame(JSON.stringify({ v: 1, type: 'hello', deviceId: 'has space' })),
    ).toMatchObject({
      code: 'invalid-field',
    });
    expect(
      decodeFrame(
        JSON.stringify({ v: 1, type: 'transfer-chunk', loanId: 'l1', index: 0, data: '<svg>' }),
      ),
    ).toMatchObject({ code: 'invalid-field' });
    expect(
      decodeFrame(
        JSON.stringify({
          v: 1,
          type: 'transfer-start',
          loanId: 'l1',
          trackId: 't1',
          size: 100,
          sha256: 'nope',
          chunkSize: 48,
          chunkCount: 3,
        }),
      ),
    ).toMatchObject({ code: 'invalid-field' });
    expect(
      decodeFrame(
        JSON.stringify({
          v: 1,
          type: 'transfer-start',
          loanId: 'l1',
          trackId: 't1',
          size: 100,
          sha256: SHA,
          chunkSize: 48,
          chunkCount: 9,
        }),
      ),
    ).toMatchObject({ code: 'invalid-field' });
    expect(decodeFrame('x'.repeat(MAX_FRAME_BYTES + 1))).toMatchObject({ code: 'too-large' });
    expect(() =>
      encodeFrame({ type: 'error', code: 'x', message: 'y'.repeat(MAX_FRAME_BYTES) }),
    ).toThrow(SyncError);
  });

  it('base64 helpers survive every byte value', () => {
    const source = Uint8Array.from({ length: 1024 }, (_, index) => index % 256);
    expect(base64ToBytes(bytesToBase64(source))).toEqual(source);
    expect(() => base64ToBytes('%%%')).toThrow(SyncError);
  });
});

describe('transfer chunks', () => {
  it('moves a file through sender and assembler with a verified digest', async () => {
    const payload = bytes(100);
    const meta = planTransfer('l1', 't1', payload.byteLength, await sha256Hex(payload), 48);
    expect(meta.chunkCount).toBe(3);
    const sender = new TransferSender(payload, meta);
    const assembler = new TransferAssembler(meta);
    let frame = sender.next();
    while (frame) {
      if (frame.type !== 'transfer-chunk') throw new Error('unexpected frame');
      assembler.push(frame.index, base64ToBytes(frame.data));
      frame = sender.next();
    }
    expect(sender.done).toBe(true);
    expect(assembler.progress).toBe(1);
    expect(await assembler.finish()).toEqual(payload);
  });

  it('rejects duplicates, gaps, wrong sizes and corrupted files', async () => {
    const payload = bytes(100);
    const meta = planTransfer('l1', 't1', 100, await sha256Hex(payload), 48);
    const assembler = new TransferAssembler(meta);
    assembler.push(0, payload.subarray(0, 48));
    expect(() => assembler.push(0, payload.subarray(0, 48))).toThrow(/already/);
    expect(() => assembler.push(5, payload.subarray(0, 48))).toThrow(/range/);
    expect(() => assembler.push(1, payload.subarray(0, 10))).toThrow(/length/);
    await expect(assembler.finish()).rejects.toThrow(/incomplete/);

    const tampered = new TransferAssembler(meta);
    tampered.push(0, payload.subarray(0, 48));
    tampered.push(1, payload.subarray(48, 96));
    tampered.push(2, Uint8Array.from([9, 9, 9, 9]));
    await expect(tampered.finish()).rejects.toThrow(/corrupted/);
  });

  it('refuses oversized or inconsistent transfer headers', () => {
    expect(() => planTransfer('l1', 't1', 0, SHA)).toThrow();
    expect(() => planTransfer('l1', 't1', 200 * 1024 * 1024 + 1, SHA)).toThrow();
    expect(
      () => new TransferSender(bytes(10), { ...planTransfer('l1', 't1', 10, SHA), size: 11 }),
    ).toThrow();
  });
});

describe('library index pagination', () => {
  const entry = (index: number): LibraryEntry => ({
    trackId: `track-${index}`,
    title: `A reasonably long song title number ${index}`,
    artist: 'An artist with a normal name',
    album: 'An album with a normal name',
    duration: 200 + (index % 100),
    size: 4_000_000 + index,
  });

  it('pages a large index under the transport limit and marks only the last page', () => {
    const entries = Array.from({ length: 5_000 }, (_, index) => entry(index));
    const pages = paginateLibraryIndex(entries);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(frameBytes(encodeFrame(page))).toBeLessThanOrEqual(MAX_FRAME_BYTES);
      expect(decodeFrame(encodeFrame(page))).toMatchObject({ ok: true });
      expect(encodeFrame(page)).toContain('"library-index"');
    }
    expect(pages.filter((page) => page.complete)).toHaveLength(1);
    expect(pages.at(-1)?.complete).toBe(true);
    expect(pages.flatMap((page) => page.entries)).toEqual(entries);
  });

  it('handles an empty library and refuses impossible payloads', () => {
    expect(paginateLibraryIndex([])).toEqual([
      { type: 'library-index', entries: [], complete: true },
    ]);
    expect(() =>
      paginateLibraryIndex(Array.from({ length: 50_001 }, (_, index) => entry(index))),
    ).toThrow(/cannot exceed/);
    expect(() => paginateLibraryIndex([{ ...entry(1), title: 'x'.repeat(200_000) }])).toThrow(
      /too large/,
    );
    expect(() => paginateLibraryIndex([entry(1)], 10)).toThrow(/budget/);
  });
});

describe('sender validation', () => {
  it('rejects inconsistent transfer metadata from a peer', () => {
    const payload = bytes(10);
    expect(
      () =>
        new TransferSender(payload, {
          loanId: 'l1',
          trackId: 't1',
          size: 10,
          sha256: 'not-a-digest',
          chunkSize: 48,
          chunkCount: 1,
        }),
    ).toThrow(SyncError);
  });
});
