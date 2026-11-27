export const LOSSLESS_EXTENSIONS = ['flac', 'wav', 'aiff', 'aif'] as const;
export const LOSSY_EXTENSIONS = ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'webm'] as const;

export type AudioKind = 'lossless' | 'lossy' | 'unknown';

export function audioKind(fileName: string): AudioKind {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if ((LOSSLESS_EXTENSIONS as readonly string[]).includes(extension)) return 'lossless';

  if ((LOSSY_EXTENSIONS as readonly string[]).includes(extension)) return 'lossy';
  return 'unknown';
}

export function requiresExactCopy(fileName: string): boolean {
  return audioKind(fileName) === 'lossless';
}

export interface IntegrityExpectation {
  size: number;

  sha256: string;
}

export type IntegrityFailure =
  'size-mismatch' | 'digest-mismatch' | 'empty' | 'too-large' | 'no-hash';

export type IntegrityResult =
  | { ok: true; size: number; sha256: string }
  | { ok: false; reason: IntegrityFailure; detail: string };

export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;

export async function verifyCopy(
  bytes: Uint8Array,
  expected: IntegrityExpectation,
): Promise<IntegrityResult> {
  if (!Number.isSafeInteger(expected.size) || expected.size < 0)
    return { ok: false, reason: 'size-mismatch', detail: 'Invalid announced size.' };
  if (expected.size > MAX_AUDIO_BYTES)
    return { ok: false, reason: 'too-large', detail: 'The file exceeds the import limit.' };
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty', detail: 'The copy is empty.' };
  if (bytes.byteLength !== expected.size)
    return {
      ok: false,
      reason: 'size-mismatch',
      detail: `Received ${bytes.byteLength} bytes, expected ${expected.size}.`,
    };
  if (typeof expected.sha256 !== 'string' || !SHA256.test(expected.sha256))
    return { ok: false, reason: 'no-hash', detail: 'The sender did not provide a valid digest.' };
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (sha256 !== expected.sha256)
    return {
      ok: false,
      reason: 'digest-mismatch',
      detail: 'The copy is not identical to the original.',
    };
  return { ok: true, size: bytes.byteLength, sha256 };
}

export function identicalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;

  const step = 0x8000;
  for (let offset = 0; offset < left.byteLength; offset += step) {
    const end = Math.min(offset + step, left.byteLength);
    for (let index = offset; index < end; index++) {
      if (left[index] !== right[index]) return false;
    }
  }
  return true;
}

export function loanQualityNote(fileName: string): string {
  return requiresExactCopy(fileName)
    ? 'Lossless original copied byte for byte (no re-encoding, no resampling).'
    : 'Original file copied byte for byte (no re-encoding, no bitrate change).';
}

export function wrapWav24(
  sampleRate: number,
  bitsPerSample: number,
  channels: number,
  seconds: number,
): Uint8Array {
  if (bitsPerSample !== 24) throw new Error('This fixture only builds 24-bit audio.');
  const frames = Math.floor(sampleRate * seconds);
  const blockAlign = channels * 3;
  const dataSize = frames * blockAlign;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      bytes[offset + index] = text.charCodeAt(index);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);

  bytes[44] = 0xff;
  bytes[45] = 0xff;
  bytes[46] = 0x7f;
  return bytes;
}
