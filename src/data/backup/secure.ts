import { openDB, type DBSchema } from 'idb';

const MAGIC = 'WAVEBK2\n';
const CHUNK = 1024 * 1024;
const MAX_CHUNKS = 16_384;
const ITERATIONS = 600_000;
const MAX_HEADER = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const bytes = (v: Uint8Array): BufferSource => v as BufferSource;
const hex = (v: Uint8Array) => Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('');
function unhex(value: string, length: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length !== length * 2 || !/^[0-9a-f]+$/u.test(value))
    throw new Error('Invalid backup');
  return Uint8Array.from(value.match(/../gu)!, (v) => parseInt(v, 16));
}
async function hash(value: BufferSource): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', value)));
}
interface KeyStore extends DBSchema {
  identity: { key: string; value: CryptoKeyPair };
}
async function identity(): Promise<CryptoKeyPair> {
  const db = await openDB<KeyStore>('wave-backup-identity', 1, {
    upgrade(db) {
      db.createObjectStore('identity');
    },
    blocking(_old, _new, event) {
      (event.target as IDBDatabase).close();
    },
  });
  try {
    const existing = await db.get('identity', 'self');
    if (existing) return existing;
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);

    try {
      await db.add('identity', keys, 'self');
      return keys;
    } catch {
      const winner = await db.get('identity', 'self');
      if (winner) return winner;
      throw new Error('Identity unavailable');
    }
  } finally {
    db.close();
  }
}
export async function deviceFingerprint(): Promise<string> {
  const keys = await identity();
  return hash(await crypto.subtle.exportKey('raw', keys.publicKey));
}
async function passwordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!password || encoder.encode(password).length > 1024) throw new Error('Invalid password');
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bytes(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
function ivFor(prefix: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  iv.set(prefix);
  new DataView(iv.buffer).setUint32(8, index, false);
  return iv;
}
interface SignedHeader {
  version: 2;
  publicKey: string;
  salt: string;
  nonce: string;
  size: number;
  hashes: string[];
}
interface Header {
  signed: SignedHeader;
  signature: string;
}

export async function encryptBackup(
  plain: Blob,
  password: string,
): Promise<{ file: Blob; fingerprint: string }> {
  const count = Math.ceil(plain.size / CHUNK);
  if (!count || count > MAX_CHUNKS) throw new Error('Backup too large');
  const keys = await identity();
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  const key = await passwordKey(password, salt);
  const chunks: BlobPart[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = await plain.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivFor(nonce, i) },
      key,
      raw,
    );
    hashes.push(await hash(encrypted));
    chunks.push(encrypted);
  }
  const signed: SignedHeader = {
    version: 2,
    publicKey: hex(publicKey),
    salt: hex(salt),
    nonce: hex(nonce),
    size: plain.size,
    hashes,
  };
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    encoder.encode(JSON.stringify(signed)),
  );
  const header = encoder.encode(
    JSON.stringify({ signed, signature: hex(new Uint8Array(signature)) } satisfies Header),
  );
  if (header.length > MAX_HEADER) throw new Error('Backup too large');
  const prefix = new Uint8Array(12);
  prefix.set(encoder.encode(MAGIC));
  new DataView(prefix.buffer).setUint32(8, header.length, true);
  return {
    file: new Blob([prefix, header, ...chunks], { type: 'application/octet-stream' }),
    fingerprint: await hash(bytes(publicKey)),
  };
}

export async function decryptBackup(
  file: Blob,
  password: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ archive: Blob; fingerprint: string }> {
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (prefix.length !== 12 || new TextDecoder().decode(prefix.slice(0, 8)) !== MAGIC)
    throw new Error('Invalid backup');
  const length = new DataView(prefix.buffer).getUint32(8, true);
  if (!length || length > MAX_HEADER || 12 + length > file.size) throw new Error('Invalid backup');
  const data = JSON.parse(await file.slice(12, 12 + length).text()) as Header;
  const signed = data?.signed;
  if (
    !signed ||
    signed.version !== 2 ||
    !Number.isSafeInteger(signed.size) ||
    signed.size < 1 ||
    signed.size > MAX_CHUNKS * CHUNK ||
    !Array.isArray(signed.hashes) ||
    signed.hashes.length !== Math.ceil(signed.size / CHUNK) ||
    signed.hashes.some((h) => typeof h !== 'string' || !/^[0-9a-f]{64}$/u.test(h))
  )
    throw new Error('Invalid backup');
  const publicKey = unhex(signed.publicKey, 65);
  const salt = unhex(signed.salt, 16);
  const nonce = unhex(signed.nonce, 8);
  const signature = unhex(data.signature, 64);
  const publicCrypto = await crypto.subtle.importKey(
    'raw',
    bytes(publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  if (
    !(await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicCrypto,
      bytes(signature),
      encoder.encode(JSON.stringify(signed)),
    ))
  )
    throw new Error('Invalid signature');
  if (file.size !== 12 + length + signed.size + signed.hashes.length * 16)
    throw new Error('Corrupt backup');
  const key = await passwordKey(password, salt);
  const chunks: BlobPart[] = [];
  let offset = 12 + length;
  onProgress?.(0, signed.size);
  for (let i = 0; i < signed.hashes.length; i++) {
    const size = Math.min(CHUNK, signed.size - i * CHUNK) + 16;
    const encrypted = await file.slice(offset, offset + size).arrayBuffer();
    if ((await hash(encrypted)) !== signed.hashes[i]) throw new Error('Corrupt backup');
    try {
      chunks.push(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivFor(nonce, i) }, key, encrypted),
      );
    } catch {
      throw new Error('Incorrect password or corrupt backup');
    }
    offset += size;
    onProgress?.(Math.min((i + 1) * CHUNK, signed.size), signed.size);
  }
  return { archive: new Blob(chunks), fingerprint: await hash(bytes(publicKey)) };
}
export async function isEncryptedBackup(file: Blob): Promise<boolean> {
  return new TextDecoder().decode(await file.slice(0, 8).arrayBuffer()) === MAGIC;
}
