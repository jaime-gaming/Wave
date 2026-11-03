import { bytesToBase64, base64ToBytes, sha256Hex, SyncError } from './protocol';

/**
 * Device pairing for Wave sync.
 *
 * A guest scans a QR code (or opens the same link) that carries the host's
 * ephemeral public key, then both sides derive a shared AES-GCM key with
 * ECDH P-256 + HKDF. No account, server or shared secret is involved. Both
 * devices show the same six-digit code; confirming it on both sides protects
 * against an active relay substituting its own key.
 */
export const PAIRING_SCHEME = 'wave://pair/1/';
export const PAIRING_TTL_MS = 120_000;
const INFO = 'wave-sync-v1 aes-gcm';
const SAS_INFO = 'wave-sync-v1 sas';
const DEVICE_ID = /^[A-Za-z0-9_-]{8,72}$/u;
const NAME_BYTES = 64;

export interface LocalIdentity {
  deviceId: string;
  keys: CryptoKeyPair;
  publicKey: Uint8Array;
}

export interface PairingInvite {
  deviceId: string;
  name: string;
  publicKey: Uint8Array;
}

function randomDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytesToBase64(bytes).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function createIdentity(deviceId?: string, name?: string): Promise<LocalIdentity> {
  const id = deviceId ?? randomDeviceId();
  assertDeviceId(id);
  void name;
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  return { deviceId: id, keys, publicKey: await exportPublicKey(keys.publicKey) };
}

export function assertDeviceId(deviceId: string): void {
  if (!DEVICE_ID.test(deviceId))
    throw new SyncError('invalid-device', 'Device identifiers must be 8-72 URL-safe characters.');
}

function encodeName(name: string): string {
  return bytesToBase64(new TextEncoder().encode(name.trim().slice(0, NAME_BYTES)))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

function decodeName(value: string): string | null {
  try {
    const bytes = base64ToBytes(value.replace(/-/gu, '+').replace(/_/gu, '/'));
    return new TextDecoder().decode(bytes).slice(0, NAME_BYTES) || null;
  } catch {
    return null;
  }
}

/** Compact, QR-friendly invite: `wave://pair/1/<deviceId>.<name>.<publicKey>`. */
export function encodePairingLink(invite: PairingInvite): string {
  assertDeviceId(invite.deviceId);
  if (!invite.publicKey?.length) throw new SyncError('invalid-key', 'Missing public key.');
  const key = bytesToBase64(invite.publicKey)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
  return `${PAIRING_SCHEME}${invite.deviceId}.${encodeName(invite.name)}.${key}`;
}

export function parsePairingLink(text: string): PairingInvite | null {
  const value = text.trim();
  if (!value.startsWith(PAIRING_SCHEME)) return null;
  const [deviceId, rawName, rawKey] = value.slice(PAIRING_SCHEME.length).split('.');
  if (!deviceId || !rawName || !rawKey || !DEVICE_ID.test(deviceId)) return null;
  const name = decodeName(rawName);
  if (!name) return null;
  let publicKey: Uint8Array;
  try {
    publicKey = base64ToBytes(rawKey.replace(/-/gu, '+').replace(/_/gu, '/'));
  } catch {
    return null;
  }
  // Uncompressed P-256 points are 65 bytes and start with 0x04.
  if (publicKey.length !== 65 || publicKey[0] !== 4) return null;
  return { deviceId, name, publicKey };
}

async function importPeerKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 65 || raw[0] !== 4)
    throw new SyncError('invalid-key', 'Peer public key is not a valid P-256 point.');
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function ordered(a: Uint8Array, b: Uint8Array): Uint8Array {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? concat(a, b) : concat(b, a);
  }
  return concat(a, b);
}

/** ECDH + HKDF-SHA-256, salted with both public keys so each pair is unique. */
export async function deriveSessionKey(
  identity: LocalIdentity,
  peerPublicKey: Uint8Array,
): Promise<CryptoKey> {
  const peer = await importPeerKey(peerPublicKey);
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peer },
    identity.keys.privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: ordered(identity.publicKey, peerPublicKey) as unknown as BufferSource,
      info: new TextEncoder().encode(INFO) as unknown as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Six digits both devices should show, derived from the shared key material. */
export async function sasCode(
  localPublicKey: Uint8Array,
  peerPublicKey: Uint8Array,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    concat(
      new TextEncoder().encode(SAS_INFO),
      ordered(localPublicKey, peerPublicKey),
    ) as unknown as BufferSource,
  );
  const bytes = new Uint8Array(digest);
  const value = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1_000_000;
  return String(value).padStart(6, '0');
}

export interface SealedFrame {
  iv: string;
  data: string;
}

export async function sealFrame(key: CryptoKey, plaintext: string): Promise<SealedFrame> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: new TextEncoder().encode(INFO) as unknown as BufferSource,
    },
    key,
    new TextEncoder().encode(plaintext) as unknown as BufferSource,
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) };
}

/** Returns null when the frame was not produced by the paired device. */
export async function openFrame(key: CryptoKey, sealed: SealedFrame): Promise<string | null> {
  try {
    const iv = base64ToBytes(sealed.iv);
    if (iv.length !== 12) return null;
    const data = base64ToBytes(sealed.data);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: new TextEncoder().encode(INFO) as unknown as BufferSource,
      },
      key,
      data as unknown as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** Digest of a loan file, used to detect corruption before it is stored. */
export function verifyDigest(bytes: Uint8Array, expected: string): Promise<boolean> {
  return sha256Hex(bytes).then((digest) => digest === expected);
}
