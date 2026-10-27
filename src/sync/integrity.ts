/**
 * Audio integrity rules for everything Wave 1.1 adds.
 *
 * The invariant is absolute: **a song that reaches another device is the same
 * bytes it had on the device it came from.** No resampling, no bitrate
 * reduction, no transcoding, no "quality" setting, no lossy intermediate
 * format, no metadata rewrite. Wave compares whole-file SHA-256 digests, so a
 * single altered byte is detected and the copy is discarded.
 *
 * Consequences that the code below enforces:
 * - The byte buffer produced by a transfer is authoritative; it is never
 *   re-encoded and never passed through an audio decoder to be saved again.
 * - Lossless sources keep their exact sample rate, bit depth and channel layout.
 * - The received size must equal the source size; a "close enough" transfer is
 *   a corrupt transfer.
 * - Cover art and artwork never travel inside the audio payload; they cannot be
 *   re-compressed into the file being copied.
 */
export const LOSSLESS_EXTENSIONS = ['flac', 'wav', 'aiff', 'aif'] as const;
export const LOSSY_EXTENSIONS = ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'webm'] as const;

export type AudioKind = 'lossless' | 'lossy' | 'unknown';

export function audioKind(fileName: string): AudioKind {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if ((LOSSLESS_EXTENSIONS as readonly string[]).includes(extension)) return 'lossless';
  // M4A can carry ALAC or AAC; without parsing the container it is not lossless
  // by assumption, and Wave must not claim otherwise.
  if ((LOSSY_EXTENSIONS as readonly string[]).includes(extension)) return 'lossy';
  return 'unknown';
}

/** True when a copy must be bit-identical to be acceptable at all. */
export function requiresExactCopy(fileName: string): boolean {
  return audioKind(fileName) === 'lossless';
}

export interface IntegrityExpectation {
  /** Bytes the source claims to contain. */
  size: number;
  /** SHA-256 of the whole original file. */
  sha256: string;
}

export type IntegrityFailure =
  'size-mismatch' | 'digest-mismatch' | 'empty' | 'too-large' | 'no-hash';

export type IntegrityResult =
  | { ok: true; size: number; sha256: string }
  | { ok: false; reason: IntegrityFailure; detail: string };

export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;

/**
 * Verifies a received copy against the expectation announced by the sender.
 * Called before anything is persisted, so a damaged copy can never become a
 * playable song.
 */
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

/**
 * Compares two copies byte for byte. Used after a loan is written to storage and
 * by tests that prove a WAV/FLAC file survived the round trip untouched.
 */
export function identicalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  // Compare in chunks to keep the tight loop predictable for large files.
  const step = 0x8000;
  for (let offset = 0; offset < left.byteLength; offset += step) {
    const end = Math.min(offset + step, left.byteLength);
    for (let index = offset; index < end; index++) {
      if (left[index] !== right[index]) return false;
    }
  }
  return true;
}

/** Human-facing note for a loan, so no copy is ever sharing without a label. */
export function loanQualityNote(fileName: string): string {
  return requiresExactCopy(fileName)
    ? 'Lossless original copied byte for byte (no re-encoding, no resampling).'
    : 'Original file copied byte for byte (no re-encoding, no bitrate change).';
}

/**
 * Test fixture: a valid 24-bit PCM WAV. Three bytes per sample, so any
 * truncation, resampling or bit-depth reduction changes the length or the
 * digest and can never pass as the original.
 */
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
  // The first sample is the 24-bit positive ceiling, so a downgrade is visible.
  bytes[44] = 0xff;
  bytes[45] = 0xff;
  bytes[46] = 0x7f;
  return bytes;
}
