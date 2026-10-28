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

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const writer = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(writer).arrayBuffer());
}

/**
 * Encodes a signalling payload. `d` means deflated, `p` means plain base64, so
 * a receiver never has to guess.
 */
export async function encodeSignal(payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  if (json.length > MAX_SIGNAL_CHARS)
    throw new SyncError('signal-too-large', 'That signalling message is too large.');
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      return SIGNAL_PREFIX + 'd.' + toBase64(await pipe(bytes, new CompressionStream('deflate')));
    } catch {
      // Fall through to plain text: a browser without a working compressor can
      // still pair, the code is just longer.
    }
  }
  return SIGNAL_PREFIX + 'p.' + toBase64(bytes);
}

export async function decodeSignal<T = unknown>(code: string): Promise<T> {
  const value = code.replace(/\s+/gu, '');
  if (!value.startsWith(SIGNAL_PREFIX))
    throw new SyncError('invalid-signal', 'That does not look like a Wave code.');
  if (value.length > MAX_SIGNAL_CHARS)
    throw new SyncError('signal-too-large', 'That code is too long to be a Wave code.');
  const [kind, data] = value.slice(SIGNAL_PREFIX.length).split('.');
  if (!data) throw new SyncError('invalid-signal', 'The code is incomplete.');
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
      json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate')));
    } catch {
      throw new SyncError('invalid-signal', 'The code is damaged.');
    }
  } else if (kind === 'p') {
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
