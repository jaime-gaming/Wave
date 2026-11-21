import { SyncError } from './protocol';

/**
 * One code in, one code out.
 *
 * Pairing two devices needs a signalling channel, and Wave does not have a
 * server to be one: an account-free app cannot ask a stranger's relay to carry
 * its SDP. So the browser itself is the channel — the host copies a short code,
 * the guest pastes it, the guest copies the reply, the host pastes that. Two
 * pastes and the two devices are looking at the same six-digit code.
 *
 * The payload is compacted before it is shown: SDP is verbose, and a code that
 * fits on a screen is a code people will actually send. Compression is used when
 * the browser has it and skipped when it does not, with the prefix telling the
 * other side which one it is looking at.
 */
export const SIGNAL_PREFIX = 'wave1.';
/** Long enough for a full SDP with candidates, short enough to refuse garbage. */
export const MAX_SIGNAL_CHARS = 24_000;

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const fromBase64 = (value: string) => {
  const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit: number,
) {
  const readable = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit)
        throw new SyncError('signal-too-large', 'That signalling message is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Encodes a signalling payload. `d` means deflated, `p` means plain base64, so
 * a receiver never has to guess.
 */
export async function encodeSignal(payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_SIGNAL_CHARS)
    throw new SyncError('signal-too-large', 'That signalling message is too large.');
  if (typeof CompressionStream === 'function') {
    try {
      const compressed =
        SIGNAL_PREFIX +
        'd.' +
        toBase64(await pipe(bytes, new CompressionStream('deflate'), MAX_SIGNAL_CHARS));
      if (compressed.length <= MAX_SIGNAL_CHARS) return compressed;
    } catch {
      // Fall through to plain text: a browser without a working compressor can
      // still pair, the code is just longer.
    }
  }
  const code = SIGNAL_PREFIX + 'p.' + toBase64(bytes);
  if (code.length > MAX_SIGNAL_CHARS)
    throw new SyncError('signal-too-large', 'That signalling message is too large.');
  return code;
}

export async function decodeSignal<T = unknown>(code: string): Promise<T> {
  const value = code.replace(/\s+/gu, '');
  if (!value.startsWith(SIGNAL_PREFIX))
    throw new SyncError('invalid-signal', 'That does not look like a Wave code.');
  if (value.length > MAX_SIGNAL_CHARS)
    throw new SyncError('signal-too-large', 'That code is too long to be a Wave code.');
  const parts = value.slice(SIGNAL_PREFIX.length).split('.');
  const [kind, data] = parts;
  if (parts.length !== 2 || !data || !/^[A-Za-z0-9_-]+$/u.test(data))
    throw new SyncError('invalid-signal', 'The code is incomplete.');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(data);
  } catch {
    throw new SyncError('invalid-signal', 'The code could not be read.');
  }
  let json: string;
  if (kind === 'd') {
    if (typeof DecompressionStream !== 'function')
      throw new SyncError('unsupported', 'This browser cannot read a compressed Wave code.');
    try {
      json = new TextDecoder().decode(
        await pipe(bytes, new DecompressionStream('deflate'), MAX_SIGNAL_CHARS),
      );
    } catch (error) {
      if (error instanceof SyncError) throw error;
      throw new SyncError('invalid-signal', 'The code is damaged.');
    }
  } else if (kind === 'p') {
    if (bytes.length > MAX_SIGNAL_CHARS)
      throw new SyncError('signal-too-large', 'That signalling message is too large.');
    json = new TextDecoder().decode(bytes);
  } else {
    throw new SyncError('unsupported', 'This code was made by a newer version of Wave.');
  }
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new SyncError('invalid-signal', 'The code is damaged.');
  }
}
