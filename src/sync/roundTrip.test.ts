import { beforeEach, describe, expect, it } from 'vitest';
import { createIdentity } from './pairing';
import { LoanInbox, PairingSession, type PairingState } from './session';
import { paginateLibraryIndex, planTransfer, sha256Hex, TransferSender } from './protocol';
import { identicalBytes, verifyCopy, wrapWav24 } from './integrity';
import { clearSyncStore, commitLoan, getLoanedBytes, getLoans, getSyncUsage } from './store';
import { DEFAULT_LOAN_POLICY } from './loan';

/**
 * Waits for queued delivery and the asynchronous seal/open calls. Several short
 * ticks rather than one: under a full parallel run the crypto promises can take
 * longer than a single macrotask, which made this suite flaky.
 */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

/** Purchases a WAV fixture and drives it through the real transfer path. */
async function loanFixture(fixture: Uint8Array, capacityBytes = 40 * 1024 * 1024) {
  const sha256 = await sha256Hex(fixture);
  const meta = planTransfer('loan-wav', 'track-wav', fixture.byteLength, sha256, 48 * 1024);
  const inbox = new LoanInbox({ ...DEFAULT_LOAN_POLICY, capacityBytes });
  inbox.begin(meta);
  const sender = new TransferSender(fixture, meta);
  let frame = sender.next();
  while (frame) {
    if (frame.type !== 'transfer-chunk') throw new Error('unexpected frame');
    inbox.push(frame);
    frame = sender.next();
  }
  const { bytes } = await inbox.complete('loan-wav');
  return { bytes, meta, sha256 };
}

beforeEach(async () => {
  await clearSyncStore();
});

describe('a loan never degrades the audio', () => {
  it('moves a 24-bit WAV with identical bytes through transfer and storage', async () => {
    const original = wrapWav24(48000, 24, 2, 3);
    const { bytes, sha256 } = await loanFixture(original);

    // Byte-for-byte after the transfer…
    expect(identicalBytes(original, bytes)).toBe(true);
    expect(await verifyCopy(bytes, { size: original.byteLength, sha256 })).toMatchObject({
      ok: true,
    });

    // …and byte-for-byte after it is written to the loan store and read back.
    await commitLoan(
      { loanId: 'loan-wav', trackId: 'track-wav', deviceId: 'phone', size: original.byteLength },
      bytes,
      { ...DEFAULT_LOAN_POLICY, capacityBytes: 40 * 1024 * 1024 },
      Date.now(),
      'audio/wav',
      sha256,
    );
    const stored = await getLoanedBytes('loan-wav');
    expect(stored).toBeDefined();
    expect(identicalBytes(original, stored!)).toBe(true);
    expect(await sha256Hex(stored!)).toBe(sha256);
  });

  it('refuses to store a copy whose digest is wrong, even if the size matches', async () => {
    const original = wrapWav24(44100, 24, 1, 1);
    const { bytes } = await loanFixture(original);
    await expect(
      commitLoan(
        { loanId: 'loan-wav', trackId: 'track-wav', deviceId: 'phone', size: bytes.byteLength },
        bytes,
        DEFAULT_LOAN_POLICY,
        Date.now(),
        'audio/wav',
        'b'.repeat(64),
      ),
    ).rejects.toThrow(/not identical/);
    expect(await getLoans()).toEqual([]);
    expect(await getLoanedBytes('loan-wav')).toBeUndefined();
  });

  it('rejects a truncated transfer before it can be persisted', async () => {
    const original = wrapWav24(44100, 24, 2, 2);
    const sha256 = await sha256Hex(original);
    const meta = planTransfer('loan-trunc', 'track-wav', original.byteLength, sha256, 48 * 1024);
    const inbox = new LoanInbox(DEFAULT_LOAN_POLICY);
    inbox.begin(meta);
    const sender = new TransferSender(original, meta);
    const first = sender.next();
    if (first?.type !== 'transfer-chunk') throw new Error('unexpected frame');
    inbox.push(first);
    await expect(inbox.complete('loan-trunc')).rejects.toThrow(/incomplete/);
    expect(inbox.activeTransfers).toBe(0);
  });

  it('keeps lossless sample rate and bit depth claim honest after a loan', async () => {
    const original = wrapWav24(96000, 24, 2, 1);
    const { bytes } = await loanFixture(original);
    const header = new DataView(bytes.buffer, bytes.byteOffset);
    expect(header.getUint16(34, true)).toBe(24);
    expect(header.getUint32(24, true)).toBe(96000);
  });
});

describe('sync sessions carry audio without leaking it', () => {
  it('exchanges a library index and a loan over a paired channel', async () => {
    const hostIdentity = await createIdentity(undefined, 'PC');
    const guestIdentity = await createIdentity(undefined, 'Phone');
    const guestReceived: unknown[] = [];
    const frames: string[] = [];
    // A holder avoids declaring two sessions that reference each other.
    const peers: { host?: PairingSession; guest?: PairingSession } = {};

    peers.host = new PairingSession({
      role: 'host',
      identity: hostIdentity,
      deviceName: 'PC',
      platform: 'web',
      send: (payload) => {
        frames.push(payload);
        queueMicrotask(() => void peers.guest?.receive(payload));
      },
      onSas: () => setTimeout(() => peers.host?.confirm()),
    });
    peers.guest = new PairingSession({
      role: 'guest',
      identity: guestIdentity,
      deviceName: 'Phone',
      platform: 'android',
      send: (payload) => queueMicrotask(() => void peers.host?.receive(payload)),
      onSas: () => setTimeout(() => peers.guest?.confirm()),
      onFrame: (frame) => guestReceived.push(frame),
    });
    const host = peers.host;
    host.start();
    await settle();
    expect(host.state).toBe('paired' satisfies PairingState);

    const pages = paginateLibraryIndex(
      Array.from({ length: 2_000 }, (_, index) => ({
        trackId: `t${index}`,
        title: `Song number ${index}`,
        artist: 'Wave tests',
        album: 'Fixture album',
        duration: 200,
        size: 4_000_000,
      })),
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) await host.sendFrame(page);
    await settle();
    expect(guestReceived).toHaveLength(pages.length);
    expect(guestReceived.at(-1)).toMatchObject({ complete: true });

    // Nothing readable leaves the device: audio bytes are never in a frame.
    expect(frames.some((frame) => frame.includes('RIFF'))).toBe(false);
    const audio = wrapWav24(44100, 24, 1, 1);
    const digest = await sha256Hex(audio);
    const meta = planTransfer('loan-x', 'track-x', audio.byteLength, digest);
    const sender = new TransferSender(audio, meta);
    await host.sendFrame({ type: 'transfer-start', ...meta });
    let chunk = sender.next();
    while (chunk) {
      await host.sendFrame(chunk);
      chunk = sender.next();
    }
    await host.sendFrame({ type: 'transfer-complete', loanId: 'loan-x', sha256: digest });
    await settle();
    expect(guestReceived).toHaveLength(pages.length + 1 + meta.chunkCount + 1);
    const usage = await getSyncUsage();
    expect(usage.usage.tracks).toBe(0);
  });

  it('stops a replayed sealed frame', async () => {
    const hostIdentity = await createIdentity(undefined, 'PC');
    const guestIdentity = await createIdentity(undefined, 'Phone');
    const toGuest: string[] = [];
    const applied: unknown[] = [];
    const peers: { guest?: PairingSession } = {};
    const host = new PairingSession({
      role: 'host',
      identity: hostIdentity,
      deviceName: 'PC',
      platform: 'web',
      send: (payload) => {
        toGuest.push(payload);
        queueMicrotask(() => void peers.guest?.receive(payload));
      },
      onSas: () => setTimeout(() => host.confirm()),
    });
    peers.guest = new PairingSession({
      role: 'guest',
      identity: guestIdentity,
      deviceName: 'Phone',
      platform: 'android',
      send: (payload) => queueMicrotask(() => void host.receive(payload)),
      onSas: () => setTimeout(() => peers.guest?.confirm()),
      onFrame: (frame) => applied.push(frame),
    });
    const guest = peers.guest;
    host.start();
    await settle();
    await host.sendFrame({ type: 'ping', at: 1 });
    await settle();
    expect(applied).toHaveLength(1);

    const sealed = toGuest.find((frame) => frame.includes('"sealed"'));
    expect(sealed).toBeDefined();
    await guest.receive(sealed!);
    expect(guest.state).toBe('failed');
    expect(guest.failure).toBe('replay');
    expect(applied).toHaveLength(1);
  });
});
