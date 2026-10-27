import { describe, expect, it } from 'vitest';
import { createIdentity, encodePairingLink, parsePairingLink } from './pairing';
import { LoanInbox, PairingSession, type PairingFailure, type PairingState } from './session';
import {
  base64ToBytes,
  encodeFrame,
  planTransfer,
  sha256Hex,
  TransferSender,
  type SyncFrame,
} from './protocol';
import { DEFAULT_LOAN_POLICY } from './loan';

/** Two sessions wired together with an in-memory channel. */
async function connect(options: { confirm?: boolean } = {}) {
  const confirms = options.confirm ?? true;
  const hostIdentity = await createIdentity(undefined, 'PC');
  const guestIdentity = await createIdentity(undefined, 'Phone');
  const events: { host: PairingState[]; guest: PairingState[]; failures: PairingFailure[] } = {
    host: [],
    guest: [],
    failures: [],
  };
  const received: { host: SyncFrame[]; guest: SyncFrame[] } = { host: [], guest: [] };
  const sas: { host?: string; guest?: string } = {};
  // Declared in a holder because each session's transport references the other.
  const peers: { host?: PairingSession; guest?: PairingSession } = {};

  peers.host = new PairingSession({
    role: 'host',
    identity: hostIdentity,
    deviceName: 'PC',
    platform: 'web',
    send: (payload) => queueMicrotask(() => void peers.guest?.receive(payload)),
    onState: (state, failure) => {
      events.host.push(state);
      if (failure) events.failures.push(failure);
    },
    onSas: (code) => {
      sas.host = code;
      if (confirms) setTimeout(() => peers.host?.confirm());
    },
    onFrame: (frame) => received.host.push(frame),
  });
  peers.guest = new PairingSession({
    role: 'guest',
    identity: guestIdentity,
    deviceName: 'Phone',
    platform: 'android',
    send: (payload) => queueMicrotask(() => void peers.host?.receive(payload)),
    onState: (state, failure) => {
      events.guest.push(state);
      if (failure) events.failures.push(failure);
    },
    onSas: (code) => {
      sas.guest = code;
      if (confirms) setTimeout(() => peers.guest?.confirm());
    },
    onFrame: (frame) => received.guest.push(frame),
  });
  return {
    host: peers.host!,
    guest: peers.guest!,
    hostIdentity,
    guestIdentity,
    events,
    received,
    sas,
  };
}

/**
 * Lets queued delivery and the asynchronous seal/open calls finish. Several short
 * waits instead of one: under a full parallel test run the crypto promises can
 * take longer than a single macrotask, which made this suite flaky.
 */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

/**
 * Waits for a condition instead of guessing how long the handshake needs. Six
 * fixed waits are enough on an idle machine and not always enough on a busy one.
 */
const settleUntil = async (ready: () => boolean, budget = 3000) => {
  const started = Date.now();
  while (!ready() && Date.now() - started < budget) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await settle();
};

describe('pairing session', () => {
  it('pairs two devices after both confirm the same code', async () => {
    const { host, guest, sas, received, events } = await connect();
    host.start();
    await settle();
    expect(host.state).toBe('paired');
    expect(guest.state).toBe('paired');
    expect(sas.host).toBe(sas.guest);
    expect(host.peer).toMatchObject({ name: 'Phone', platform: 'android' });
    expect(events.host).toContain('awaiting-confirmation');

    await host.sendFrame({ type: 'ping', at: 1 });
    await settle();
    expect(received.guest).toEqual([{ type: 'ping', at: 1 }]);
  });

  it('never pairs when the displayed codes differ', async () => {
    const { host, guest, events } = await connect({ confirm: false });
    host.start();
    await settle();
    expect(host.state).toBe('awaiting-confirmation');
    // Both sides derived the same code, so force a mismatch to model a relay.
    guest.sas = '000000';
    guest.confirm();
    await settle();
    // The device that receives a mismatched code is the one that refuses.
    expect(host.state).toBe('failed');
    expect(host.failure).toBe('authentication');
    expect(events.failures).toContain('authentication');
    expect(guest.state).not.toBe('paired');
  });

  it('expires an unanswered invite', async () => {
    const identity = await createIdentity();
    const failures: PairingFailure[] = [];
    const session = new PairingSession({
      role: 'host',
      identity,
      deviceName: 'PC',
      platform: 'web',
      send: () => undefined,
      onState: (_state, failure) => void (failure && failures.push(failure)),
      now: () => 1_000,
      ttlMs: 5_000,
    });
    session.start();
    session.tick(5_000);
    expect(session.state).toBe('inviting');
    session.tick(6_500);
    expect(session.state).toBe('failed');
    expect(failures).toEqual(['timeout']);
  });

  it('reports a user rejection and refuses to send unpaired frames', async () => {
    const identity = await createIdentity();
    const states: PairingState[] = [];
    const session = new PairingSession({
      role: 'guest',
      identity,
      deviceName: 'Phone',
      platform: 'android',
      send: () => undefined,
      onState: (state) => states.push(state),
    });
    session.start();
    await expect(session.sendFrame({ type: 'ping', at: 1 })).rejects.toThrow(/not paired/);
    session.reject();
    expect(session.state).toBe('failed');
    expect(states).toEqual(['inviting', 'failed']);
  });

  it('ignores payload frames and tampering before pairing', async () => {
    const identity = await createIdentity();
    const frames: SyncFrame[] = [];
    const session = new PairingSession({
      role: 'host',
      identity,
      deviceName: 'PC',
      platform: 'web',
      send: () => undefined,
      onFrame: (frame) => frames.push(frame),
    });
    session.start();
    await session.receive(encodeFrame({ type: 'revoke-loan', loanId: 'loan1' }));
    await session.receive(
      JSON.stringify({ v: 1, type: 'sealed', iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' }),
    );
    expect(frames).toEqual([]);
    expect(session.state).toBe('failed');
  });

  it('rejects a hello from itself', async () => {
    const identity = await createIdentity();
    const session = new PairingSession({
      role: 'host',
      identity,
      deviceName: 'PC',
      platform: 'web',
      send: () => undefined,
    });
    session.start();
    const self = parsePairingLink(
      encodePairingLink({ deviceId: identity.deviceId, name: 'PC', publicKey: identity.publicKey }),
    );
    await session.receive(
      encodeFrame({
        type: 'hello',
        deviceId: identity.deviceId,
        name: 'PC',
        platform: 'web',
        protocolVersion: 1,
        publicKey: btoa(String.fromCharCode(...(self?.publicKey ?? new Uint8Array())))
          .replace(/\+/gu, '-')
          .replace(/\//gu, '_')
          .replace(/=+$/u, ''),
      }),
    );
    expect(session.state).toBe('failed');
    expect(session.failure).toBe('self');
  });
});

describe('loan inbox', () => {
  it('reassembles a verified file and clears the transfer', async () => {
    const payload = Uint8Array.from({ length: 5000 }, (_, index) => (index * 7) % 256);
    const meta = planTransfer(
      'loan-a',
      'track-a',
      payload.byteLength,
      await sha256Hex(payload),
      2048,
    );
    const inbox = new LoanInbox(DEFAULT_LOAN_POLICY);
    inbox.begin(meta);
    const sender = new TransferSender(payload, meta);
    let frame = sender.next();
    while (frame) {
      if (frame.type !== 'transfer-chunk') throw new Error('unexpected frame');
      inbox.push(frame);
      frame = sender.next();
    }
    expect(inbox.progress('loan-a')).toEqual({ received: 3, total: 3, complete: true });
    const { bytes } = await inbox.complete('loan-a');
    expect(base64ToBytes(btoa(String.fromCharCode(...bytes)))).toEqual(bytes);
    expect(bytes).toEqual(payload);
    expect(inbox.progress('loan-a')).toBeNull();
  });

  it('refuses loans beyond the local capacity and unknown chunks', async () => {
    const inbox = new LoanInbox({ capacityBytes: 10, maxTracks: 4 });
    const meta = planTransfer('loan-b', 'track-b', 100, 'a'.repeat(64), 48);
    expect(() => inbox.begin(meta)).toThrow(/fit/);
    expect(() =>
      inbox.push({ type: 'transfer-chunk', loanId: 'missing', index: 0, data: 'AAAA' }),
    ).toThrow(/No transfer/);
    await expect(inbox.complete('missing')).rejects.toThrow(/No transfer/);
  });
});

describe('sealed frame hardening', () => {
  /** Host/peer pair where every host frame is captured for inspection. */
  async function pairedPair() {
    let deliver = true;
    const hostIdentity = await createIdentity();
    const peerIdentity = await createIdentity();
    const captured: string[] = [];
    const peerFrames: SyncFrame[] = [];
    const peers: { peer?: PairingSession } = {};
    const host = new PairingSession({
      role: 'host',
      identity: hostIdentity,
      deviceName: 'PC',
      platform: 'web',
      send: (payload) => {
        captured.push(payload);
        if (deliver) queueMicrotask(() => void peers.peer?.receive(payload));
      },
      onSas: () => setTimeout(() => host.confirm()),
    });
    peers.peer = new PairingSession({
      role: 'guest',
      identity: peerIdentity,
      deviceName: 'Phone',
      platform: 'android',
      send: (payload) => queueMicrotask(() => void host.receive(payload)),
      onSas: () => setTimeout(() => peers.peer?.confirm()),
      onFrame: (frame) => peerFrames.push(frame),
    });
    host.start();
    await settleUntil(() => host.state === 'paired');
    expect(host.state).toBe('paired');
    return {
      host,
      peer: peers.peer!,
      peerFrames,
      captured,
      stopDelivering: () => {
        deliver = false;
      },
    };
  }

  it('accepts an authenticated frame exactly once', async () => {
    const { host, peerFrames, captured } = await pairedPair();
    await host.sendFrame({ type: 'ping', at: 1 });
    await settle();
    expect(peerFrames).toEqual([{ type: 'ping', at: 1 }]);
    const sealed = captured.at(-1);
    expect(sealed).toBeDefined();
    return { sealed };
  });

  it('rejects a replayed frame', async () => {
    const { host, peer, peerFrames, captured } = await pairedPair();
    await host.sendFrame({ type: 'ping', at: 1 });
    await settle();
    expect(peerFrames).toHaveLength(1);
    await peer.receive(captured.at(-1) as string);
    expect(peer.state).toBe('failed');
    expect(peer.failure).toBe('replay');
    expect(peerFrames).toHaveLength(1);
  });

  it('rejects a frame with a missing or repeated sequence number', async () => {
    const { host, peer, captured } = await pairedPair();
    await host.sendFrame({ type: 'ping', at: 1 });
    const first = JSON.parse(captured.at(-1) as string);
    await peer.receive(JSON.stringify(first));
    await peer.receive(JSON.stringify({ ...first, n: 1 }));
    expect(peer.failure).toBe('replay');
  });

  it('rejects a tampered ciphertext instead of applying it', async () => {
    const { host, peer, peerFrames, captured, stopDelivering } = await pairedPair();
    stopDelivering();
    await host.sendFrame({ type: 'ping', at: 1 });
    const sealed = JSON.parse(captured.at(-1) as string);
    const tampered = { ...sealed, data: `${sealed.data.slice(0, -4)}AAAA` };
    await peer.receive(JSON.stringify(tampered));
    expect(peer.state).toBe('failed');
    expect(peer.failure).toBe('authentication');
    expect(peerFrames).toEqual([]);
  });

  it('refuses an oversized sealed envelope before decrypting', async () => {
    const identity = await createIdentity();
    const session = new PairingSession({
      role: 'guest',
      identity,
      deviceName: 'Phone',
      platform: 'android',
      send: () => undefined,
      autoExpire: false,
    });
    session.start();
    await session.receive(
      JSON.stringify({
        v: 1,
        type: 'sealed',
        n: 1,
        iv: 'AAAAAAAAAAAAAAAA',
        data: 'A'.repeat(200_000),
      }),
    );
    expect(session.failure).toBe('protocol');
  });

  it('never surfaces frames from a peer that is not authenticated', async () => {
    const identity = await createIdentity();
    const frames: SyncFrame[] = [];
    const session = new PairingSession({
      role: 'host',
      identity,
      deviceName: 'PC',
      platform: 'web',
      send: () => undefined,
      onFrame: (frame) => frames.push(frame),
    });
    session.start();
    await session.receive(
      JSON.stringify({ v: 1, type: 'sealed', n: 1, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' }),
    );
    expect(frames).toEqual([]);
    expect(session.state).toBe('failed');
  });
});

describe('loan inbox validation', () => {
  it('rejects undecodable chunk data and frees the transfer for a retry', async () => {
    const payload = Uint8Array.from({ length: 64 }, (_, index) => index);
    const meta = planTransfer(
      'loan-retry',
      'track-retry',
      payload.byteLength,
      await sha256Hex(payload),
      32,
    );
    const inbox = new LoanInbox(DEFAULT_LOAN_POLICY);
    inbox.begin(meta);
    expect(() =>
      inbox.push({ type: 'transfer-chunk', loanId: 'loan-retry', index: 0, data: '***' }),
    ).toThrow(/decoded/);
    expect(inbox.activeTransfers).toBe(1);

    const bad = planTransfer('loan-bad', 'track-bad', 2, 'c'.repeat(64), 32);
    inbox.begin(bad);
    inbox.push({ type: 'transfer-chunk', loanId: 'loan-bad', index: 0, data: btoa('zz') });
    await expect(inbox.complete('loan-bad')).rejects.toThrow(/corrupted/);
    expect(inbox.progress('loan-bad')).toBeNull();
    inbox.abortAll();
    expect(inbox.activeTransfers).toBe(0);
  });
});
