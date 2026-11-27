import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { clearWaveData } from '../reset';
import { deviceFingerprint, encryptBackup, decryptBackup, isEncryptedBackup } from './secure';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(async () => {
  await clearWaveData();
  vi.unstubAllGlobals();
});
const blob = (parts: BlobPart[]) => new NodeBlob(parts as never[]) as unknown as Blob;
const text = 'a password that will not be saved';

it('encrypts, signs, verifies and decrypts multiple chunks with a stable device fingerprint', async () => {
  const input = blob(['secret song and metadata', new Uint8Array(1024 * 1024 + 20)]);
  const fingerprint = await deviceFingerprint();
  const { file, fingerprint: exported } = await encryptBackup(input, text);
  expect(exported).toBe(fingerprint);
  expect(await isEncryptedBackup(file)).toBe(true);
  expect(await file.text()).not.toContain('secret song and metadata');
  const progress: Array<[number, number]> = [];
  const result = await decryptBackup(file, text, (done, total) => progress.push([done, total]));
  expect(progress).toEqual([
    [0, input.size],
    [1024 * 1024, input.size],
    [input.size, input.size],
  ]);
  expect(result.fingerprint).toBe(fingerprint);
  expect(
    Buffer.compare(
      Buffer.from(await result.archive.arrayBuffer()),
      Buffer.from(await input.arrayBuffer()),
    ),
  ).toBe(0);
  expect(await deviceFingerprint()).toBe(fingerprint);
}, 30_000);

it('rejects wrong passwords, truncation, ciphertext corruption and signed-header tampering', async () => {
  const { file } = await encryptBackup(blob(['private']), text);
  await expect(decryptBackup(file, 'wrong password')).rejects.toThrow();
  const raw = new Uint8Array(await file.arrayBuffer());
  const truncated = blob([raw.slice(0, raw.length - 1)]);
  await expect(decryptBackup(truncated, text)).rejects.toThrow();
  raw[raw.length - 1] ^= 1;
  await expect(decryptBackup(blob([raw]), text)).rejects.toThrow();
  const original = new Uint8Array(await file.arrayBuffer());
  const length = new DataView(original.buffer).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(original.slice(12, 12 + length)));
  header.signed.hashes[0] = '0'.repeat(64);
  const encoded = new TextEncoder().encode(JSON.stringify(header));
  expect(encoded.length).toBe(length);
  original.set(encoded, 12);
  await expect(decryptBackup(blob([original]), text)).rejects.toThrow();
}, 30_000);

it('regenerates identity after reset and does not silently reuse the old key', async () => {
  const first = await deviceFingerprint();
  await clearWaveData();
  expect(await deviceFingerprint()).not.toBe(first);
});

it('reads the published synthetic cross-platform format vector', async () => {
  const fixture = (await import('./fixtures/v2.json')).default;
  const file = blob([Buffer.from(fixture.fileBase64, 'base64')]);
  const result = await decryptBackup(file, fixture.password);
  expect(result.fingerprint).toBe(fixture.fingerprint);
  expect(Buffer.from(await result.archive.arrayBuffer()).toString('base64')).toBe(
    fixture.archiveBase64,
  );
  const { prepareLibrary } = await import('./legacy');
  const prepared = await prepareLibrary(result.archive);
  expect(prepared.tracks).toBe(0);
  await prepared.restore();
}, 30_000);

it('uses one identity when multiple tabs initialize concurrently', async () => {
  const [first, second, third] = await Promise.all([
    deviceFingerprint(),
    deviceFingerprint(),
    deviceFingerprint(),
  ]);
  expect(second).toBe(first);
  expect(third).toBe(first);
});
