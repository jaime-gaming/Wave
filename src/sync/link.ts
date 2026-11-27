import {
  DEFAULT_CHUNK_BYTES,
  MAX_LIBRARY_ENTRIES,
  MAX_LOAN_TRACK_BYTES,
  SYNC_PROTOCOL_VERSION,
  paginateLibraryIndex,
  SyncError,
  type LibraryEntry,
} from './protocol';
import { LoanInbox, PairingSession, type PairingFailure, type PairingState } from './session';
import type { LocalIdentity } from './pairing';
import { keyFingerprint } from './identity';
import { DEFAULT_LOAN_POLICY, type LoanPolicy, type LoanRequest } from './loan';
import { commitLoan, getDevices, saveDevice } from './store';
import type { SyncFrame } from './protocol';
import type { Transport } from './transport';

export type LinkStatus =
  | { kind: 'idle' }
  | { kind: 'pairing'; state: PairingState }
  | { kind: 'confirm'; code: string; peerName: string }
  | { kind: 'connected'; peerName: string }
  | { kind: 'failed'; reason: PairingFailure | 'transport' };

export interface PeerLibrary {
  entries: LibraryEntry[];
  complete: boolean;
}

export interface LinkTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  size: number;
  blob: Blob;
}

export interface LoanReceiver {
  (loan: { loanId: string; trackId: string; title?: string; artist?: string }): void;
}

export interface DeviceLinkOptions {
  tracks: () => LinkTrack[];
  name: string;
  deviceId: string;
  policy?: LoanPolicy;
  onStatus?: (status: LinkStatus) => void;
  onLibrary?: (library: PeerLibrary) => void;
  onProgress?: (progress: { received: number; total: number; title?: string } | null) => void;
  onLoaned: LoanReceiver;
  onError?: (message: string) => void;
}

export class DeviceLink {
  private identity: LocalIdentity;
  private session?: PairingSession;
  private transport?: Transport;
  private inbox: LoanInbox;
  private sending = new Set<string>();
  private peerEntries: LibraryEntry[] = [];
  private requested = new Map<string, LoanRequest>();
  private incoming: Promise<void> = Promise.resolve();
  private serving: Promise<void> = Promise.resolve();

  private constructor(
    private readonly options: DeviceLinkOptions,
    identity: LocalIdentity,
  ) {
    this.identity = identity;
    this.inbox = new LoanInbox(options.policy ?? DEFAULT_LOAN_POLICY);
  }

  static create(options: DeviceLinkOptions, identity: LocalIdentity): DeviceLink {
    return new DeviceLink(options, identity);
  }

  private status(status: LinkStatus) {
    this.options.onStatus?.(status);
  }

  async invite(transport: Transport): Promise<string> {
    this.transport = transport;
    this.bind(transport, 'host');
    this.session = this.buildSession(transport, 'host');
    this.session.start();
    this.status({ kind: 'pairing', state: this.session.state });
    return transport.localCode();
  }

  async join(transport: Transport, code: string): Promise<string | null> {
    this.transport = transport;
    this.bind(transport, 'guest');
    const reply = await transport.acceptCode(code);
    this.session = this.buildSession(transport, 'guest');
    this.session.start();
    this.status({ kind: 'pairing', state: this.session.state });
    return reply;
  }

  confirm() {
    this.session?.confirm();
  }

  async request(entries: LibraryEntry[]) {
    if (!this.session || this.session.state !== 'paired')
      throw new SyncError('not-paired', 'Link a device first.');
    const peerId = this.session.peer?.deviceId;
    if (!peerId) throw new SyncError('not-paired', 'Link a device first.');
    const requests: LoanRequest[] = entries.map((entry) => ({
      loanId: crypto.randomUUID(),
      trackId: entry.trackId,
      deviceId: this.identity.deviceId,
      size: entry.size,
      title: entry.title,
      artist: entry.artist,
    }));

    for (const request of requests) this.requested.set(request.loanId, request);
    for (let offset = 0; offset < requests.length; offset += 40) {
      await this.session.sendFrame({
        type: 'loan-offer',
        requests: requests.slice(offset, offset + 40),
      });
    }
    return requests.length;
  }

  close() {
    this.session?.close();
    this.transport?.close();
    this.inbox.abortAll();
    this.requested.clear();
  }

  private buildSession(transport: Transport, role: 'host' | 'guest') {
    const session = new PairingSession({
      role,
      identity: this.identity,
      deviceName: this.options.name,
      platform: 'web',
      send: (payload) => transport.send(payload),
      onState: (state, failure) => {
        if (state === 'paired' && session.peer) {
          void saveDevice({
            deviceId: session.peer.deviceId,
            name: session.peer.name,
            platform: session.peer.platform,
            pairedAt: Date.now(),
            lastSeenAt: Date.now(),
            protocolVersion: SYNC_PROTOCOL_VERSION,
            publicKey: session.peerPublicKey ? keyFingerprint(session.peerPublicKey) : undefined,
          });
          this.status({ kind: 'connected', peerName: session.peer.name });

          void this.sendLibrary(session).catch(() =>
            this.options.onError?.('The library could not be sent.'),
          );
        } else if (state === 'failed')
          this.status({ kind: 'failed', reason: failure ?? 'transport' });
      },
      onSas: (code) => {
        void this.confirmIfKnown(session, code);
      },
      onFrame: (frame) => {
        if (frame.type === 'loan-offer') {
          this.serving = this.serving.then(() => this.onFrame(frame));
        } else {
          this.incoming = this.incoming.then(() => this.onFrame(frame));
        }
      },
    });
    return session;
  }

  private async confirmIfKnown(session: PairingSession, code: string) {
    const peerId = session.peer?.deviceId;
    const key = session.peerPublicKey ? keyFingerprint(session.peerPublicKey) : undefined;
    if (peerId && key) {
      try {
        const known = (await getDevices()).find((device) => device.deviceId === peerId);
        if (known?.protocolVersion === SYNC_PROTOCOL_VERSION && known.publicKey === key) {
          session.confirm();
          return;
        }
      } catch {}
    }
    if (this.session !== session || session.state !== 'awaiting-confirmation') return;
    this.status({
      kind: 'confirm',
      code,
      peerName: session.peer?.name ?? 'the other device',
    });
  }

  private bind(transport: Transport, role: 'host' | 'guest') {
    transport.receive((payload) => void this.session?.receive(payload));
    transport.onState((state) => {
      if (state === 'closed' && this.session && this.session.state !== 'closed')
        this.status({ kind: 'failed', reason: 'transport' });
      void role;
    });
  }

  private async sendLibrary(session: PairingSession) {
    const entries = this.options
      .tracks()
      .filter((track) => track.blob.size > 0 && track.blob.size <= MAX_LOAN_TRACK_BYTES)
      .slice(0, MAX_LIBRARY_ENTRIES)
      .map((track) => ({
        trackId: track.id,
        title: track.title.slice(0, 200),
        artist: track.artist.slice(0, 200),
        album: track.album.slice(0, 200),
        duration: 0,
        size: track.blob.size,
      }));
    for (const page of paginateLibraryIndex(entries, 30 * 1024)) await session.sendFrame(page);
  }

  private async onFrame(frame: SyncFrame) {
    try {
      if (frame.type === 'library-index') {
        if (this.peerEntries.length + frame.entries.length > MAX_LIBRARY_ENTRIES)
          throw new SyncError('too-many-entries', 'The other device sent too many songs.');
        this.peerEntries.push(...frame.entries);
        this.options.onLibrary?.({ entries: [...this.peerEntries], complete: frame.complete });
        if (frame.complete) this.peerEntries = [];
      } else if (frame.type === 'loan-offer') {
        for (const request of frame.requests) await this.serve(request);
      } else if (frame.type === 'transfer-start') {
        const request = this.requested.get(frame.loanId);
        if (!request || request.trackId !== frame.trackId || request.size !== frame.size)
          throw new SyncError('unrequested-transfer', 'The other device sent an unrequested song.');
        this.inbox.begin(frame);
        this.options.onProgress?.({
          received: 0,
          total: frame.chunkCount,
          title: frame.trackId,
        });
      } else if (frame.type === 'transfer-chunk') {
        this.inbox.push(frame);
        this.options.onProgress?.({
          received: this.inbox.progress(frame.loanId)?.received ?? 0,
          total: this.inbox.progress(frame.loanId)?.total ?? 0,
        });
      } else if (frame.type === 'transfer-complete') {
        const { meta, bytes } = await this.inbox.complete(frame.loanId);
        const request = this.requested.get(frame.loanId);
        if (!request) throw new SyncError('unrequested-transfer', 'The song was not requested.');
        await commitLoan(
          {
            loanId: meta.loanId,
            trackId: meta.trackId,
            deviceId: this.session?.peer?.deviceId ?? 'peer',
            size: meta.size,
            title: request.title,
            artist: request.artist,
          },
          bytes,
          this.options.policy ?? DEFAULT_LOAN_POLICY,
          Date.now(),
          meta.mime ?? 'application/octet-stream',
          frame.sha256,
        );
        this.requested.delete(frame.loanId);
        this.options.onLoaned({
          loanId: meta.loanId,
          trackId: meta.trackId,
          title: request.title,
          artist: request.artist,
        });
        this.options.onProgress?.(null);
      } else if (frame.type === 'transfer-abort') {
        this.inbox.abort(frame.loanId);
        this.requested.delete(frame.loanId);
        this.options.onProgress?.(null);
      }
    } catch (error) {
      this.inbox.abortAll();
      this.requested.clear();
      this.peerEntries = [];
      this.options.onProgress?.(null);
      this.options.onError?.(
        error instanceof SyncError ? error.message : 'A song could not be transferred.',
      );
    }
  }

  private async serve(request: LoanRequest) {
    const session = this.session;
    const track = this.options.tracks().find((candidate) => candidate.id === request.trackId);
    if (!session || !track || this.sending.has(request.loanId)) return;
    this.sending.add(request.loanId);
    try {
      const bytes = new Uint8Array(await track.blob.arrayBuffer());
      if (bytes.byteLength !== request.size) throw new SyncError('size', 'File changed size.');
      const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
      const sha256 = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const chunkCount = Math.ceil(bytes.byteLength / DEFAULT_CHUNK_BYTES);
      await session.sendFrame({
        type: 'transfer-start',
        loanId: request.loanId,
        trackId: request.trackId,
        size: request.size,
        sha256,
        chunkSize: DEFAULT_CHUNK_BYTES,
        chunkCount,
        mime: /^(audio\/[a-z0-9.+-]+|application\/octet-stream)$/u.test(track.blob.type)
          ? track.blob.type
          : 'application/octet-stream',
      });
      for (let index = 0; index < chunkCount; index++) {
        const slice = bytes.subarray(
          index * DEFAULT_CHUNK_BYTES,
          (index + 1) * DEFAULT_CHUNK_BYTES,
        );
        let binary = '';
        for (const byte of slice) binary += String.fromCharCode(byte);
        await session.sendFrame({
          type: 'transfer-chunk',
          loanId: request.loanId,
          index,
          data: btoa(binary),
        });
      }
      await session.sendFrame({ type: 'transfer-complete', loanId: request.loanId, sha256 });
    } catch (error) {
      await session
        .sendFrame({
          type: 'transfer-abort',
          loanId: request.loanId,
          reason: error instanceof Error ? error.message.slice(0, 200) : 'Transfer failed',
        })
        .catch(() => undefined);
    } finally {
      this.sending.delete(request.loanId);
    }
  }
}
