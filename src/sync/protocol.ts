import type { LoanRequest } from './loan';

/**
 * Wave sync protocol, version 1.
 *
 * Frames are plain JSON text so the same contract can be implemented by the web
 * client, the Android client and a future relay. Everything except the initial
 * `hello` exchange is sealed with AES-GCM (see pairing.ts). Audio never leaves a
 * device unless the user explicitly grants a loan, and a loan is always a
 * complete, verified file.
 */
export const SYNC_PROTOCOL_VERSION = 1;
/** Upper bound for any single transport message, including base64 overhead. */
export const MAX_FRAME_BYTES = 96 * 1024;
/** Raw bytes per audio chunk. Base64 keeps the envelope under MAX_FRAME_BYTES. */
export const DEFAULT_CHUNK_BYTES = 48 * 1024;
/** Same ceiling as a local import: 200 MB per stored file. */
export const MAX_LOAN_TRACK_BYTES = 200 * 1024 * 1024;
export const MAX_LIBRARY_ENTRIES = 50_000;

export type Platform = 'web' | 'android' | 'windows';

export interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: Platform;
  protocolVersion: number;
}

export interface LibraryEntry {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  size: number;
}

export interface TransferMetadata {
  loanId: string;
  trackId: string;
  size: number;
  sha256: string;
  chunkSize: number;
  chunkCount: number;
}

export type SyncFrame =
  | ({ type: 'hello' } & DeviceInfo & { publicKey: string })
  | { type: 'pair-confirm'; sas: string }
  | { type: 'pair-reject'; reason: string }
  | { type: 'library-index'; entries: LibraryEntry[]; complete: boolean }
  | { type: 'loan-offer'; requests: LoanRequest[] }
  | { type: 'loan-accept'; loanIds: string[] }
  | { type: 'loan-decline'; loanIds: string[]; reason: string }
  | ({ type: 'transfer-start' } & TransferMetadata)
  | { type: 'transfer-chunk'; loanId: string; index: number; data: string }
  | { type: 'transfer-complete'; loanId: string; sha256: string }
  | { type: 'transfer-abort'; loanId: string; reason: string }
  | { type: 'revoke-loan'; loanId: string }
  | { type: 'ping'; at: number }
  | { type: 'pong'; at: number }
  | { type: 'error'; code: string; message: string };

export type FrameType = SyncFrame['type'];

export class SyncError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

export type DecodeResult =
  { ok: true; frame: SyncFrame } | { ok: false; code: string; detail: string };

const fail = (code: string, detail: string): DecodeResult => ({ ok: false, code, detail });

const ID = /^[A-Za-z0-9_-]{1,72}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;

const string = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length <= max ? value : null;
const id = (value: unknown): string | null =>
  typeof value === 'string' && ID.test(value) ? value : null;
const count = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : null;
const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400
    ? value
    : null;

function readDevice(value: Record<string, unknown>): DeviceInfo | null {
  const deviceId = id(value.deviceId);
  const name = string(value.name, 64);
  const platform = value.platform;
  const protocolVersion = count(value.protocolVersion, 1000);
  if (!deviceId || name === null || protocolVersion === null) return null;
  if (platform !== 'web' && platform !== 'android' && platform !== 'windows') return null;
  return { deviceId, name: name.trim() || 'Wave device', platform, protocolVersion };
}

function readTransferMetadata(value: Record<string, unknown>): TransferMetadata | null {
  const loanId = id(value.loanId);
  const trackId = id(value.trackId);
  const size = count(value.size, MAX_LOAN_TRACK_BYTES);
  const sha256 = string(value.sha256, 64);
  const chunkSize = count(value.chunkSize, MAX_FRAME_BYTES);
  const chunkCount = count(value.chunkCount, Math.ceil(MAX_LOAN_TRACK_BYTES / 1024));
  if (!loanId || !trackId || !size || !sha256 || !SHA256.test(sha256)) return null;
  if (!chunkSize || chunkSize < 1 || !chunkCount) return null;
  if (Math.ceil(size / chunkSize) !== chunkCount) return null;
  return { loanId, trackId, size, sha256, chunkSize, chunkCount };
}

function readEntries(value: unknown): LibraryEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIBRARY_ENTRIES) return null;
  const entries: LibraryEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const trackId = id(item.trackId);
    const title = string(item.title, 200);
    const artist = string(item.artist, 200);
    const album = string(item.album, 200);
    const duration = seconds(item.duration);
    const size = count(item.size, MAX_LOAN_TRACK_BYTES);
    if (!trackId || title === null || artist === null || album === null) return null;
    if (duration === null || size === null) return null;
    entries.push({ trackId, title, artist, album, duration, size });
  }
  return entries;
}

function readLoanRequests(value: unknown): LoanRequest[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIBRARY_ENTRIES) return null;
  const requests: LoanRequest[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const loanId = id(item.loanId);
    const trackId = id(item.trackId);
    const deviceId = id(item.deviceId);
    const size = count(item.size, MAX_LOAN_TRACK_BYTES);
    if (!loanId || !trackId || !deviceId || !size) return null;
    if (item.pinned !== undefined && typeof item.pinned !== 'boolean') return null;
    const title = item.title === undefined ? undefined : string(item.title, 200);
    const artist = item.artist === undefined ? undefined : string(item.artist, 200);
    if (title === null || artist === null) return null;
    requests.push({
      loanId,
      trackId,
      deviceId,
      size,
      ...(title !== undefined ? { title } : {}),
      ...(artist !== undefined ? { artist } : {}),
      ...(item.pinned === true ? { pinned: true } : {}),
    });
  }
  return requests;
}

/** Validates and parses a frame. Unknown or malformed input is never applied. */
export function decodeFrame(raw: string): DecodeResult {
  if (typeof raw !== 'string') return fail('invalid-json', 'Frame is not text.');
  const bytes = new TextEncoder().encode(raw).byteLength;
  if (bytes > MAX_FRAME_BYTES) return fail('too-large', `Frame exceeds ${MAX_FRAME_BYTES} bytes.`);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail('invalid-json', 'Frame is not valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('invalid-json', 'Frame is not an object.');
  const frame = value as Record<string, unknown>;
  if (frame.v !== SYNC_PROTOCOL_VERSION)
    return fail('unsupported-version', 'Unsupported protocol.');
  const type = frame.type;
  if (typeof type !== 'string') return fail('unknown-type', 'Missing frame type.');

  switch (type as FrameType) {
    case 'hello': {
      const device = readDevice(frame);
      const publicKey = string(frame.publicKey, 200);
      if (!device || !publicKey) return fail('invalid-field', 'Malformed hello frame.');
      return { ok: true, frame: { type: 'hello', ...device, publicKey } };
    }
    case 'pair-confirm': {
      const sas = string(frame.sas, 16);
      return sas === null
        ? fail('invalid-field', 'Malformed confirmation.')
        : { ok: true, frame: { type: 'pair-confirm', sas } };
    }
    case 'pair-reject': {
      const reason = string(frame.reason, 200);
      return reason === null
        ? fail('invalid-field', 'Malformed rejection.')
        : { ok: true, frame: { type: 'pair-reject', reason } };
    }
    case 'library-index': {
      const entries = readEntries(frame.entries);
      if (!entries) return fail('invalid-field', 'Malformed library index.');
      return {
        ok: true,
        frame: { type: 'library-index', entries, complete: frame.complete === true },
      };
    }
    case 'loan-offer': {
      const requests = readLoanRequests(frame.requests);
      return requests
        ? { ok: true, frame: { type: 'loan-offer', requests } }
        : fail('invalid-field', 'Malformed loan offer.');
    }
    case 'loan-accept': {
      if (!Array.isArray(frame.loanIds) || frame.loanIds.length > MAX_LIBRARY_ENTRIES)
        return fail('invalid-field', 'Malformed loan acceptance.');
      const loanIds = frame.loanIds.map(id);
      if (loanIds.some((value) => !value)) return fail('invalid-field', 'Malformed loan ID.');
      return { ok: true, frame: { type: 'loan-accept', loanIds: loanIds as string[] } };
    }
    case 'loan-decline': {
      const reason = string(frame.reason, 200);
      if (
        !Array.isArray(frame.loanIds) ||
        frame.loanIds.length > MAX_LIBRARY_ENTRIES ||
        reason === null
      )
        return fail('invalid-field', 'Malformed loan decline.');
      const loanIds = frame.loanIds.map(id);
      if (loanIds.some((value) => !value)) return fail('invalid-field', 'Malformed loan ID.');
      return { ok: true, frame: { type: 'loan-decline', loanIds: loanIds as string[], reason } };
    }
    case 'transfer-start': {
      const meta = readTransferMetadata(frame);
      return meta
        ? { ok: true, frame: { type: 'transfer-start', ...meta } }
        : fail('invalid-field', 'Malformed transfer header.');
    }
    case 'transfer-chunk': {
      const loanId = id(frame.loanId);
      const index = count(frame.index, Math.ceil(MAX_LOAN_TRACK_BYTES / 1024));
      const data = string(frame.data, MAX_FRAME_BYTES);
      if (!loanId || index === null || data === null)
        return fail('invalid-field', 'Malformed chunk.');
      if (!BASE64.test(data)) return fail('invalid-field', 'Chunk is not base64.');
      return { ok: true, frame: { type: 'transfer-chunk', loanId, index, data } };
    }
    case 'transfer-complete': {
      const loanId = id(frame.loanId);
      const sha256 = string(frame.sha256, 64);
      if (!loanId || sha256 === null || !SHA256.test(sha256))
        return fail('invalid-field', 'Malformed transfer confirmation.');
      return { ok: true, frame: { type: 'transfer-complete', loanId, sha256 } };
    }
    case 'transfer-abort': {
      const loanId = id(frame.loanId);
      const reason = string(frame.reason, 200);
      if (!loanId || reason === null) return fail('invalid-field', 'Malformed abort.');
      return { ok: true, frame: { type: 'transfer-abort', loanId, reason } };
    }
    case 'revoke-loan': {
      const loanId = id(frame.loanId);
      return loanId
        ? { ok: true, frame: { type: 'revoke-loan', loanId } }
        : fail('invalid-field', 'Malformed revocation.');
    }
    case 'ping':
    case 'pong': {
      const at = count(frame.at, Number.MAX_SAFE_INTEGER);
      return at === null
        ? fail('invalid-field', 'Malformed ping.')
        : { ok: true, frame: { type: type as 'ping' | 'pong', at } };
    }
    case 'error': {
      const code = string(frame.code, 64);
      const message = string(frame.message, 300);
      if (code === null || message === null) return fail('invalid-field', 'Malformed error frame.');
      return { ok: true, frame: { type: 'error', code, message } };
    }
    default:
      return fail('unknown-type', `Unknown frame type: ${String(type).slice(0, 40)}`);
  }
}

export function encodeFrame(frame: SyncFrame): string {
  const raw = JSON.stringify({ v: SYNC_PROTOCOL_VERSION, ...frame });
  if (new TextEncoder().encode(raw).byteLength > MAX_FRAME_BYTES)
    throw new SyncError('too-large', 'Frame exceeds the transport limit.');
  return raw;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (!BASE64.test(value)) throw new SyncError('invalid-base64', 'Chunk is not base64.');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Splits a file into the fixed-size chunks announced by `transfer-start`. */
export function planTransfer(
  loanId: string,
  trackId: string,
  size: number,
  sha256: string,
  chunkSize = DEFAULT_CHUNK_BYTES,
): TransferMetadata {
  const meta = readTransferMetadata({
    loanId,
    trackId,
    size,
    sha256,
    chunkSize,
    chunkCount: Math.ceil(size / chunkSize),
  });
  if (!meta) throw new SyncError('invalid-transfer', 'Invalid transfer metadata.');
  return meta;
}

/** Receives chunks, rejecting gaps, duplicates, oversized data and wrong digests. */
export class TransferAssembler {
  readonly meta: TransferMetadata;
  private readonly buffer: Uint8Array;
  private readonly received: Uint8Array;
  private bytes = 0;

  constructor(meta: TransferMetadata) {
    const validated = readTransferMetadata(meta as unknown as Record<string, unknown>);
    if (!validated) throw new SyncError('invalid-transfer', 'Invalid transfer metadata.');
    this.meta = validated;
    this.buffer = new Uint8Array(validated.size);
    this.received = new Uint8Array(validated.chunkCount);
  }

  get receivedChunks(): number {
    return this.received.reduce((total, flag) => total + flag, 0);
  }
  get receivedBytes(): number {
    return this.bytes;
  }
  get complete(): boolean {
    return this.receivedChunks === this.meta.chunkCount;
  }
  get progress(): number {
    return this.meta.chunkCount ? this.receivedChunks / this.meta.chunkCount : 1;
  }

  push(index: number, data: Uint8Array): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.meta.chunkCount)
      throw new SyncError('chunk-range', 'Chunk index out of range.');
    if (this.received[index]) throw new SyncError('chunk-duplicate', 'Chunk already received.');
    const offset = index * this.meta.chunkSize;
    const expected = Math.min(this.meta.chunkSize, this.meta.size - offset);
    if (data.byteLength !== expected) throw new SyncError('chunk-size', 'Unexpected chunk length.');
    this.buffer.set(data, offset);
    this.received[index] = 1;
    this.bytes += data.byteLength;
  }

  /** Verifies the announced digest; the caller decides whether to persist. */
  async finish(): Promise<Uint8Array> {
    if (!this.complete) throw new SyncError('incomplete', 'Transfer is incomplete.');
    const digest = await sha256Hex(this.buffer);
    if (digest !== this.meta.sha256) throw new SyncError('digest', 'Received audio is corrupted.');
    return this.buffer;
  }
}

/** Sends chunks one at a time so the transport can apply backpressure. */
export class TransferSender {
  readonly meta: TransferMetadata;
  private readonly bytes: Uint8Array;
  private index = 0;

  constructor(bytes: Uint8Array, meta: TransferMetadata) {
    if (meta.size !== bytes.byteLength)
      throw new SyncError('invalid-transfer', 'Transfer size does not match the audio.');
    this.meta = meta;
    this.bytes = bytes;
  }

  get progress(): number {
    return this.meta.chunkCount ? this.index / this.meta.chunkCount : 1;
  }
  get done(): boolean {
    return this.index >= this.meta.chunkCount;
  }

  /** Returns the next chunk frame, or null when everything has been sent. */
  next(): SyncFrame | null {
    if (this.done) return null;
    const index = this.index++;
    const start = index * this.meta.chunkSize;
    const data = bytesToBase64(
      this.bytes.subarray(start, Math.min(start + this.meta.chunkSize, this.bytes.byteLength)),
    );
    return { type: 'transfer-chunk', loanId: this.meta.loanId, index, data };
  }
}
