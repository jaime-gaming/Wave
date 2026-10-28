import {
  deriveSessionKey,
  openFrame,
  sealFrame,
  sasCode,
  type LocalIdentity,
  PAIRING_TTL_MS,
} from './pairing';
import {
  base64ToBytes,
  decodeFrame,
  encodeFrame,
  MAX_LOAN_TRACK_BYTES,
  SYNC_PROTOCOL_VERSION,
  SyncError,
  TransferAssembler,
  type DeviceInfo,
  type Platform,
  type SyncFrame,
  type TransferMetadata,
} from './protocol';
import type { LoanPolicy } from './loan';
import { verifyCopy } from './integrity';

/**
 * Transport-agnostic pairing state machine.
 *
 * The same class runs over WebRTC data channels, a loopback channel in tests or
 * a future relay, because it only ever calls `send(text)` and `receive(text)`.
 * Nothing here touches storage, audio or the interface.
 */
export type PairingState =
  'idle' | 'inviting' | 'awaiting-confirmation' | 'paired' | 'failed' | 'closed';
export type PairingFailure =
  | 'timeout'
  | 'rejected'
  | 'unsupported-version'
  | 'self'
  | 'authentication'
  | 'replay'
  | 'protocol';

/** Largest sealed envelope accepted, before any decryption is attempted. */
export const MAX_SEALED_BYTES = 140_000;
/** A legitimate peer never jumps this far ahead, so a huge `n` is rejected. */
export const MAX_SEQUENCE_GAP = 10_000;

export interface PairingSessionOptions {
  role: 'host' | 'guest';
  identity: LocalIdentity;
  deviceName: string;
  platform: Platform;
  /** Writes a message to the peer. Must not throw. */
  send: (payload: string) => void;
  onState?: (state: PairingState, failure?: PairingFailure) => void;
  onSas?: (code: string) => void;
  /** Called only for authenticated frames received while paired. */
  onFrame?: (frame: SyncFrame) => void;
  now?: () => number;
  ttlMs?: number;
  /** Schedules the invite expiry automatically. Off in tests that drive `tick`. */
  autoExpire?: boolean;
}

export class PairingSession {
  readonly role: 'host' | 'guest';
  private readonly options: PairingSessionOptions;
  private readonly now: () => number;
  private readonly ttlMs: number;
  state: PairingState = 'idle';
  failure?: PairingFailure;
  sas?: string;
  peer?: DeviceInfo;
  /** A confirmation that arrived before this side had a code to compare. */
  private earlyConfirm?: string;
  /** The user confirmed while the handshake was still running. */
  private wantsConfirm = false;
  /** The peer's raw public key, kept so a known device can be recognised. */
  peerPublicKey?: Uint8Array;
  sessionKey?: CryptoKey;
  private startedAt = 0;
  private localConfirmed = false;
  private peerConfirmed = false;
  private sendSequence = 0;
  private receiveSequence = 0;
  private expiryTimer?: ReturnType<typeof setTimeout>;

  constructor(options: PairingSessionOptions) {
    this.options = options;
    this.role = options.role;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? PAIRING_TTL_MS;
  }

  get device(): DeviceInfo {
    return {
      deviceId: this.options.identity.deviceId,
      name: this.options.deviceName.slice(0, 64) || 'Wave device',
      platform: this.options.platform,
      protocolVersion: SYNC_PROTOCOL_VERSION,
    };
  }

  start(): void {
    if (this.state !== 'idle') return;
    this.startedAt = this.now();
    this.setState('inviting');
    this.scheduleExpiry();
    this.sendRaw(
      encodeFrame({
        type: 'hello',
        ...this.device,
        publicKey: toBase64Url(this.options.identity.publicKey),
      }),
    );
  }

  /** Applies one inbound transport message. Never throws on untrusted input. */
  async receive(raw: string): Promise<void> {
    if (this.state === 'failed' || this.state === 'closed') return;
    if (this.state === 'idle') this.start();
    if (typeof raw !== 'string') {
      this.fail('protocol');
      return;
    }

    const envelope = safeParse(raw);
    if (envelope && envelope.type === 'sealed') {
      await this.receiveSealed(envelope);
      return;
    }

    const decoded = decodeFrame(raw);
    if (!decoded.ok) {
      this.fail(decoded.code === 'unsupported-version' ? 'unsupported-version' : 'protocol');
      return;
    }
    const frame = decoded.frame;
    if (frame.type === 'hello') await this.receiveHello(frame);
    else if (frame.type === 'pair-confirm') this.receiveConfirm(frame.sas);
    else if (frame.type === 'pair-reject') this.fail('rejected');
    else if (frame.type === 'error') {
      if (frame.code === 'unsupported-version') this.fail('unsupported-version');
    } else if (this.state === 'paired') this.options.onFrame?.(frame);
    // Frames that need a key are dropped instead of applied while unpaired.
  }

  /** The user compared the six-digit code on both devices. */
  confirm(): void {
    // A handshake in flight is not a refusal: the button can be pressed while
    // the key exchange is still finishing, so the intent is remembered and
    // carried out the moment the code is known.
    if (this.state === 'inviting') {
      this.wantsConfirm = true;
      return;
    }
    if (this.state !== 'awaiting-confirmation' || !this.sas) return;
    this.localConfirmed = true;
    this.sendRaw(encodeFrame({ type: 'pair-confirm', sas: this.sas }));
    this.maybeFinishPairing();
  }

  reject(reason = 'User declined the pairing'): void {
    if (this.state === 'paired' || this.state === 'failed' || this.state === 'closed') return;
    this.sendRaw(encodeFrame({ type: 'pair-reject', reason: reason.slice(0, 200) }));
    this.fail('rejected');
  }

  tick(now = this.now()): void {
    if (this.state !== 'inviting' && this.state !== 'awaiting-confirmation') return;
    if (now - this.startedAt > this.ttlMs) this.fail('timeout');
  }

  async sendFrame(frame: SyncFrame): Promise<void> {
    if (this.state !== 'paired' || !this.sessionKey)
      throw new SyncError('not-paired', 'Devices are not paired.');
    const sealed = await sealFrame(this.sessionKey, encodeFrame(frame));
    // Sequence numbers make replays detectable: a recorded frame is rejected
    // instead of being applied a second time.
    const sequence = ++this.sendSequence;
    this.sendRaw(
      JSON.stringify({ v: SYNC_PROTOCOL_VERSION, type: 'sealed', n: sequence, ...sealed }),
    );
  }

  close(): void {
    if (this.state === 'closed') return;
    this.setState('closed');
  }

  private scheduleExpiry(): void {
    if (this.options.autoExpire === false) return;
    this.clearExpiry();
    this.expiryTimer = setTimeout(() => this.tick(), this.ttlMs + 1);
    // Do not keep a Node test process alive for a timer.
    (this.expiryTimer as unknown as { unref?: () => void }).unref?.();
  }

  private clearExpiry(): void {
    if (this.expiryTimer !== undefined) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
  }

  private async receiveHello(frame: Extract<SyncFrame, { type: 'hello' }>): Promise<void> {
    if (this.state !== 'inviting') {
      this.fail('protocol');
      return;
    }
    if (frame.deviceId === this.options.identity.deviceId) {
      this.fail('self');
      return;
    }
    if (frame.protocolVersion !== SYNC_PROTOCOL_VERSION) {
      this.fail('unsupported-version');
      return;
    }
    let peerKey: Uint8Array;
    try {
      peerKey = fromBase64Url(frame.publicKey);
    } catch {
      this.fail('protocol');
      return;
    }
    if (peerKey.length !== 65 || peerKey[0] !== 4) {
      this.fail('protocol');
      return;
    }
    try {
      this.sessionKey = await deriveSessionKey(this.options.identity, peerKey);
    } catch {
      this.fail('protocol');
      return;
    }
    this.peer = {
      deviceId: frame.deviceId,
      name: frame.name,
      platform: frame.platform,
      protocolVersion: frame.protocolVersion,
    };
    this.peerPublicKey = peerKey;
    this.sas = await sasCode(this.options.identity.publicKey, peerKey);
    this.setState('awaiting-confirmation');
    this.options.onSas?.(this.sas);
    // Whatever arrived while the key exchange was still running is applied now,
    // in the order the peer sent it.
    const earlyConfirm = this.earlyConfirm;
    this.earlyConfirm = undefined;
    if (earlyConfirm !== undefined) this.receiveConfirm(earlyConfirm);
    if (this.wantsConfirm) {
      this.wantsConfirm = false;
      this.confirm();
    }
  }

  private receiveConfirm(sas: string): void {
    // The two devices derive the same code at almost the same moment, and one
    // of them confirms immediately. The other may still be finishing its own
    // key exchange when that confirmation arrives; treating it as a protocol
    // error failed an otherwise perfect pairing, so it is held until the code
    // exists and checked then.
    if (this.state === 'inviting') {
      this.earlyConfirm = sas;
      return;
    }
    if (this.state !== 'awaiting-confirmation' || !this.sas) {
      this.fail('protocol');
      return;
    }
    if (sas !== this.sas) {
      // A mismatched code means the other side derived a different key.
      this.fail('authentication');
      return;
    }
    this.peerConfirmed = true;
    this.maybeFinishPairing();
  }

  private maybeFinishPairing(): void {
    if (!this.localConfirmed || !this.peerConfirmed) return;
    this.clearExpiry();
    this.setState('paired');
  }

  private async receiveSealed(envelope: Record<string, unknown>): Promise<void> {
    if (this.state !== 'awaiting-confirmation' && this.state !== 'paired') {
      this.fail('protocol');
      return;
    }
    if (!this.sessionKey) {
      this.fail('authentication');
      return;
    }
    if (typeof envelope.iv !== 'string' || typeof envelope.data !== 'string') {
      this.fail('protocol');
      return;
    }
    // Bound the work before allocating or decrypting anything.
    if (envelope.iv.length > 64 || envelope.data.length > MAX_SEALED_BYTES) {
      this.fail('protocol');
      return;
    }
    const sequence = envelope.n;
    if (
      typeof sequence !== 'number' ||
      !Number.isSafeInteger(sequence) ||
      sequence <= this.receiveSequence ||
      sequence > this.receiveSequence + MAX_SEQUENCE_GAP
    ) {
      this.fail('replay');
      return;
    }
    const plaintext = await openFrame(this.sessionKey, {
      iv: envelope.iv,
      data: envelope.data,
    });
    if (plaintext === null) {
      this.fail('authentication');
      return;
    }
    const decoded = decodeFrame(plaintext);
    if (!decoded.ok) {
      this.fail('protocol');
      return;
    }
    // Only advance after authentication, so a forged envelope cannot consume a
    // sequence number and block the real peer.
    this.receiveSequence = sequence;
    if (this.state !== 'paired') return;
    this.options.onFrame?.(decoded.frame);
  }

  private fail(reason: PairingFailure): void {
    if (this.state === 'failed' || this.state === 'closed') return;
    this.failure = reason;
    this.sessionKey = undefined;
    this.clearExpiry();
    this.setState('failed', reason);
  }

  private setState(state: PairingState, failure?: PairingFailure): void {
    this.state = state;
    this.options.onState?.(state, failure);
  }

  private sendRaw(payload: string): void {
    try {
      this.options.send(payload);
    } catch {
      this.fail('protocol');
    }
  }
}

/** Accepts chunk frames and verifies the finished file before anything is stored. */
export class LoanInbox {
  private readonly pending = new Map<
    string,
    { meta: TransferMetadata; assembler: TransferAssembler }
  >();
  private policy: LoanPolicy;

  constructor(policy: LoanPolicy) {
    this.policy = policy;
  }

  setPolicy(policy: LoanPolicy): void {
    this.policy = policy;
  }

  get activeTransfers(): number {
    return this.pending.size;
  }

  begin(meta: TransferMetadata): void {
    if (this.pending.has(meta.loanId))
      throw new SyncError('duplicate-loan', 'This loan is already being received.');
    if (meta.size > MAX_LOAN_TRACK_BYTES || meta.size > this.policy.capacityBytes)
      throw new SyncError('capacity', 'The loan does not fit in the borrowed-audio space.');
    if (this.pending.size >= this.policy.maxTracks)
      throw new SyncError('limit', 'Too many simultaneous transfers.');
    this.pending.set(meta.loanId, { meta, assembler: new TransferAssembler(meta) });
  }

  progress(loanId: string): { received: number; total: number; complete: boolean } | null {
    const entry = this.pending.get(loanId);
    if (!entry) return null;
    return {
      received: entry.assembler.receivedChunks,
      total: entry.meta.chunkCount,
      complete: entry.assembler.complete,
    };
  }

  push(frame: Extract<SyncFrame, { type: 'transfer-chunk' }>): void {
    const entry = this.pending.get(frame.loanId);
    if (!entry) throw new SyncError('unknown-loan', 'No transfer is in progress for this loan.');
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(frame.data);
    } catch {
      throw new SyncError('invalid-chunk', 'Chunk data could not be decoded.');
    }
    entry.assembler.push(frame.index, bytes);
  }

  /** Verifies the assembled file again against the announced size and digest. */
  async complete(loanId: string): Promise<{ meta: TransferMetadata; bytes: Uint8Array }> {
    const entry = this.pending.get(loanId);
    if (!entry) throw new SyncError('unknown-loan', 'No transfer is in progress for this loan.');
    try {
      const bytes = await entry.assembler.finish();
      const check = await verifyCopy(bytes, {
        size: entry.meta.size,
        sha256: entry.meta.sha256,
      });
      if (!check.ok) throw new SyncError(check.reason, check.detail);
      return { meta: entry.meta, bytes };
    } finally {
      // A corrupted transfer must not linger and block a retry.
      this.pending.delete(loanId);
    }
  }

  abort(loanId: string): void {
    this.pending.delete(loanId);
  }

  abortAll(): void {
    this.pending.clear();
  }
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
