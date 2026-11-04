import { openDB } from 'idb';
import { createIdentity, exportPublicKey, type LocalIdentity } from './pairing';

/**
 * Who this device is, for good.
 *
 * The first version of pairing made a fresh key pair every time, which meant the
 * two devices could never recognise each other again: every link was a new
 * stranger, and the "paired" device was forgotten the moment the tab closed.
 *
 * An identity is now created once and kept in its own small database. It is not
 * an account — nothing leaves the device and there is nothing to sign in to —
 * but it is stable, so a second device can say "this is the laptop I already
 * trust" instead of asking for six digits every time. Losing it costs nothing
 * more than pairing again.
 */
const DATABASE = 'wave-sync-identity';
const STORE = 'identity';
const KEY = 'self';

export interface IdentityRecord {
  deviceId: string;
  name: string;
  publicKey: Uint8Array;
  keys: CryptoKeyPair;
  createdAt: number;
}

interface Schema {
  identity: { key: string; value: IdentityRecord };
}

async function open() {
  return openDB<Schema>(DATABASE, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

/**
 * The stable identity, created on first use.
 *
 * `crypto.subtle` is only available on a secure origin; when it is missing the
 * caller gets a session-only identity so the page can explain itself instead of
 * throwing during render.
 */
export async function loadIdentity(
  fallbackDeviceId: string,
  fallbackName: string,
): Promise<LocalIdentity & { fingerprint: string }> {
  try {
    const db = await open();
    const saved = await db.get(STORE, KEY);
    db.close();
    if (saved) {
      return {
        deviceId: saved.deviceId,
        keys: saved.keys,
        publicKey: saved.publicKey,
        fingerprint: toBase64Url(saved.publicKey),
      };
    }
  } catch {
    // A blocked or private database is not fatal: pair for this session.
  }
  const created = await createIdentity(fallbackDeviceId);
  const publicKey = created.publicKey?.length
    ? created.publicKey
    : await exportPublicKey(created.keys.publicKey);
  try {
    const db = await open();
    await db.put(
      STORE,
      {
        deviceId: created.deviceId,
        name: fallbackName,
        publicKey,
        keys: created.keys,
        createdAt: Date.now(),
      } satisfies IdentityRecord,
      KEY,
    );
    db.close();
  } catch {
    // Session-only identity.
  }
  return { ...created, publicKey, fingerprint: toBase64Url(publicKey) };
}

/** Base64url form of a peer's key, compared to decide whether it is trusted. */
export const keyFingerprint = (publicKey: Uint8Array) => toBase64Url(publicKey);

/** Forgets this device's identity. Only used when the user asks for it. */
export async function forgetIdentity(): Promise<void> {
  try {
    const db = await open();
    await db.delete(STORE, KEY);
    db.close();
  } catch {
    // Nothing stored.
  }
}
