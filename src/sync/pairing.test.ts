import { describe, expect, it } from 'vitest';
import {
  createIdentity,
  deriveSessionKey,
  encodePairingLink,
  openFrame,
  parsePairingLink,
  sasCode,
  sealFrame,
  verifyDigest,
} from './pairing';
import { sha256Hex } from './protocol';

describe('pairing keys and links', () => {
  it('creates a P-256 identity and round-trips the invite link', async () => {
    const identity = await createIdentity(undefined, 'Living room PC');
    expect(identity.publicKey).toHaveLength(65);
    expect(identity.publicKey[0]).toBe(4);
    const link = encodePairingLink({
      deviceId: identity.deviceId,
      name: 'Living room PC',
      publicKey: identity.publicKey,
    });
    expect(link.startsWith('wave://pair/1/')).toBe(true);
    expect(parsePairingLink(link)).toEqual({
      deviceId: identity.deviceId,
      name: 'Living room PC',
      publicKey: identity.publicKey,
    });
  });

  it('rejects malformed or foreign invites', async () => {
    expect(parsePairingLink('https://wave.example')).toBeNull();
    expect(parsePairingLink('wave://pair/1/short.name.key')).toBeNull();
    expect(parsePairingLink('wave://pair/2/abcdefgh.abcd.AAAA')).toBeNull();
    const identity = await createIdentity();
    const link = encodePairingLink({
      deviceId: identity.deviceId,
      name: 'Phone',
      publicKey: identity.publicKey,
    });
    expect(parsePairingLink(`${link}AA`)).toBeNull();
    const [, prefix, rest] = /^(wave:\/\/pair\/1\/)(.+)$/u.exec(link) ?? [];
    const parts = rest?.split('.') ?? [];
    expect(parsePairingLink(`${prefix}${parts[0]}.***.${parts[2]}`)).toBeNull();
    expect(parsePairingLink(`${prefix}${parts[0]}.${parts[1]}.%%%`)).toBeNull();
  });
});

describe('session keys', () => {
  it('derives the same key on both devices and seals frames', async () => {
    const host = await createIdentity();
    const guest = await createIdentity();
    const hostKey = await deriveSessionKey(host, guest.publicKey);
    const guestKey = await deriveSessionKey(guest, host.publicKey);

    const sealed = await sealFrame(hostKey, 'hello from the host');
    expect(await openFrame(guestKey, sealed)).toBe('hello from the host');
    // The host key cannot decrypt its own message with a different IV/key pair.
    const other = await createIdentity();
    const strangerKey = await deriveSessionKey(other, guest.publicKey);
    expect(await openFrame(strangerKey, sealed)).toBeNull();

    const tampered = { ...sealed, data: `${sealed.data.slice(0, -2)}AA` };
    expect(await openFrame(guestKey, tampered)).toBeNull();
    expect(await openFrame(guestKey, { iv: 'short', data: sealed.data })).toBeNull();
  });

  it('shows the same six-digit code on both devices and differs per pair', async () => {
    const a = await createIdentity();
    const b = await createIdentity();
    const c = await createIdentity();
    const ab = await sasCode(a.publicKey, b.publicKey);
    expect(ab).toMatch(/^\d{6}$/u);
    expect(await sasCode(b.publicKey, a.publicKey)).toBe(ab);
    expect(await sasCode(a.publicKey, c.publicKey)).not.toBe(ab);
  });

  it('verifies digests', async () => {
    const payload = new TextEncoder().encode('wave');
    const digest = await sha256Hex(payload);
    expect(await verifyDigest(payload, digest)).toBe(true);
    expect(await verifyDigest(payload, 'b'.repeat(64))).toBe(false);
  });
});
