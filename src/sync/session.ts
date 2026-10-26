import {
  deriveSessionKey,
  openFrame,
  sealFrame,
  sasCode,
  type LocalIdentity,
  PAIRING_TTL_MS,
} from './pairing';
import {
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

/**
 * Transport-agnostic pairing state machine.
 *
 * The same class runs over WebRTC data channels, a loopback channel in tests or
 * a future relay, because it only ever calls `send(text)` and `receive(text)`.
 * Nothing here touches storage or the interface.
 */
export type PairingState =
  'idle' | 'inviting' | 'awaiting-confirmation' | 'paired' | 'failed' | 'closed';
export type PairingFailure =
  'timeout' | 'rejected' | 'unsupported-version' | 'self' | 'authentication' | 'protocol';

export interface PairingSessionOptions {
  role: 'host' | 'guest';
  identity: LocalIdentity;
  deviceName: string;
  platform: Platform;
  /** Writes a message to the peer. Must not throw. */
  send: (payload: string) => void;
  onState?: (state: PairingState, failure?: PairingFailure) => void;
  onSas?: (code: string) => void;
  onFrame?: (frame: SyncFrame) => void;
  now?: () => number;
  ttlMs?: number;
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
  sessionKey?: CryptoKey;
  private startedAt = 0;
  private localConfirmed = false;
  private peerConfirmed = false;

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
    this.sendRaw(JSON.stringify({ v: SYNC_PROTOCOL_VERSION, type: 'sealed', ...sealed }));
  }

  close(): void {
    if (this.state === 'closed') return;
    this.setState('closed');
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
    this.sas = await sasCode(this.options.identity.publicKey, peerKey);
    this.setState('awaiting-confirmation');
    this.options.onSas?.(this.sas);
  }

  private receiveConfirm(sas: string): void {
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
    if (this.state !== 'paired') return;
    this.options.onFrame?.(decoded.frame);
  }

  private fail(reason: PairingFailure): void {
    if (this.state === 'failed' || this.state === 'closed') return;
    this.failure = reason;
    this.sessionKey = undefined;
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
    entry.assembler.push(frame.index, fromBase64(frame.data));
  }

  async complete(loanId: string): Promise<{ meta: TransferMetadata; bytes: Uint8Array }> {
    const entry = this.pending.get(loanId);
    if (!entry) throw new SyncError('unknown-loan', 'No transfer is in progress for this loan.');
    const bytes = await entry.assembler.finish();
    this.pending.delete(loanId);
    return { meta: entry.meta, bytes };
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

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
