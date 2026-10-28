import { DEFAULT_CHUNK_BYTES, SyncError, type LibraryEntry } from './protocol';
import { LoanInbox, PairingSession, type PairingFailure, type PairingState } from './session';
import { createIdentity, type LocalIdentity } from './pairing';
import { DEFAULT_LOAN_POLICY, type LoanPolicy, type LoanRequest } from './loan';
import { commitLoan, saveDevice } from './store';
import type { SyncFrame } from './protocol';
import type { Transport } from './transport';

/**
 * Two devices, linked.
 *
 * The link owns the pairing session, the transport and the bytes. It does one
 * job — make a paired peer's songs playable here — and it keeps the interface
 * out of the cryptography: the pages above it say "pair", "offer", "send" and
 * "done", and never see a frame.
 *
 * A loan is a verified copy: the sender reads its own file, chunks it, and the
 * receiver assembles it, checks the SHA-256 and only then writes it. Nothing is
 * ever played from a half-received file and nothing is trusted because it
 * arrived.
 */
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

  private constructor(
    private readonly options: DeviceLinkOptions,
    identity: LocalIdentity,
  ) {
    this.identity = identity;
    this.inbox = new LoanInbox(options.policy ?? DEFAULT_LOAN_POLICY);
  }

  /**
   * Keys are generated per session: a pairing is a live connection between two
   * open windows, not a stored credential. The device id is stable, so the other
   * side can remember who it met.
   */
  static async create(options: DeviceLinkOptions): Promise<DeviceLink> {
    const identity = await createIdentity(options.deviceId);
    return new DeviceLink(options, identity);
  }

  private status(status: LinkStatus) {
    this.options.onStatus?.(status);
  }

  /** Host side: builds the code to show. */
  async invite(transport: Transport): Promise<string> {
    this.transport = transport;
    this.bind(transport, 'host');
    this.session = this.buildSession(transport, 'host');
    this.session.start();
    this.status({ kind: 'pairing', state: this.session.state });
    return transport.localCode();
  }

  /** Guest side: pastes the host's code and returns the reply to send back. */
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

  /** Asks the peer for songs. One request per track id. */
  async request(entries: LibraryEntry[]) {
    if (!this.session || this.session.state !== 'paired')
      throw new SyncError('not-paired', 'Link a device first.');
    const peerId = this.session.peer?.deviceId;
    if (!peerId) throw new SyncError('not-paired', 'Link a device first.');
    const requests: LoanRequest[] = entries.map((entry) => ({
      loanId: `${entry.trackId}-${peerId}`.slice(0, 72),
      trackId: entry.trackId,
      deviceId: this.identity.deviceId,
      size: entry.size,
      title: entry.title,
      artist: entry.artist,
    }));
    // Send in one frame so the peer can accept them as a batch.
    const batch = requests.slice(0, 40);
    await this.session.sendFrame({ type: 'loan-offer', requests: batch });
    return batch.length;
  }

  close() {
    this.session?.close();
    this.transport?.close();
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
          });
          this.status({ kind: 'connected', peerName: session.peer.name });
          // A freshly paired peer gets our index straight away: browsing a
          // friend's library should not need a second round trip.
          void this.sendLibrary(session);
        } else if (state === 'failed')
          this.status({ kind: 'failed', reason: failure ?? 'transport' });
      },
      onSas: (code) =>
        this.status({
          kind: 'confirm',
          code,
          peerName: session.peer?.name ?? 'the other device',
        }),
      onFrame: (frame) => void this.onFrame(frame),
    });
    return session;
  }

  private bind(transport: Transport, role: 'host' | 'guest') {
    transport.receive((payload) => void this.session?.receive(payload));
    transport.onState((state) => {
      if (state === 'closed' && this.session && this.session.state !== 'paired')
        this.status({ kind: 'failed', reason: 'transport' });
      void role;
    });
  }

  private async sendLibrary(session: PairingSession) {
    const entries = this.options.tracks().map((track) => ({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: 0,
      size: track.blob.size,
    }));
    // The frame ceiling is 96 KB, so a large library goes in slices.
    const slices = Math.max(1, Math.ceil(entries.length / 600));
    for (let index = 0; index < slices; index++) {
      await session.sendFrame({
        type: 'library-index',
        entries: entries.slice(index * 600, (index + 1) * 600),
        complete: index === slices - 1,
      });
    }
  }

  private async onFrame(frame: SyncFrame) {
    try {
      if (frame.type === 'library-index') {
        this.options.onLibrary?.({
          entries: frame.entries,
          complete: frame.complete,
        });
      } else if (frame.type === 'loan-offer') {
        for (const request of frame.requests) await this.serve(request);
      } else if (frame.type === 'transfer-start') {
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
        await commitLoan(
          {
            loanId: meta.loanId,
            trackId: meta.trackId,
            deviceId: this.session?.peer?.deviceId ?? 'peer',
            size: meta.size,
            title: meta.trackId,
          },
          bytes,
          this.options.policy ?? DEFAULT_LOAN_POLICY,
          Date.now(),
          'application/octet-stream',
          frame.sha256,
        );
        this.options.onLoaned({ loanId: meta.loanId, trackId: meta.trackId });
        this.options.onProgress?.(null);
      } else if (frame.type === 'transfer-abort') {
        this.inbox.abort(frame.loanId);
        this.options.onProgress?.(null);
      }
    } catch (error) {
      this.inbox.abortAll();
      this.options.onProgress?.(null);
      this.options.onError?.(
        error instanceof SyncError ? error.message : 'A song could not be transferred.',
      );
    }
  }

  /** Sends one requested track, verified by the receiver before it is stored. */
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
