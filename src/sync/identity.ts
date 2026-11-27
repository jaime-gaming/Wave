import { openDB } from 'idb';
import { createIdentity, exportPublicKey, type LocalIdentity } from './pairing';

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
  } catch {}
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
  } catch {}
  return { ...created, publicKey, fingerprint: toBase64Url(publicKey) };
}

export const keyFingerprint = (publicKey: Uint8Array) => toBase64Url(publicKey);

export async function forgetIdentity(): Promise<void> {
  try {
    const db = await open();
    await db.delete(STORE, KEY);
    db.close();
  } catch {}
}
