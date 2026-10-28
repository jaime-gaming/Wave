/**
 * The wire between two devices.
 *
 * A WebRTC data channel, set up by hand: `offers` are exchanged as text codes
 * (see `signal.ts`), candidates are gathered before the code is shown so a
 * single exchange is enough, and the channel is opened before a pairing session
 * is allowed to start. Everything the app sends is text; encryption above the
 * channel is done by `PairingSession`.
 *
 * Two devices on the same network connect directly. Two devices on different
 * networks usually can too, because a public STUN server tells each side what
 * address the internet sees; when the networks refuse (symmetric NAT), the code
 * says so instead of hanging.
 */
export type TransportState = 'idle' | 'gathering' | 'waiting' | 'connecting' | 'open' | 'closed';

export interface Transport {
  send: (payload: string) => void;
  receive: (handler: (payload: string) => void) => void;
  onState: (handler: (state: TransportState) => void) => void;
  /** Resolves with the code to give the other device. */
  localCode: () => Promise<string>;
  /** Applies the code the other device gave us. May resolve with a code to return. */
  acceptCode: (code: string) => Promise<string | null>;
  close: () => void;
  readonly state: TransportState;
}

export const STUN_URL = 'stun:stun.l.google.com:19302';
/** Candidate gathering is bounded: an offer is never worth a minute of waiting. */
export const GATHER_TIMEOUT_MS = 8000;

interface Wire {
  description: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
  mode: 'offer' | 'answer';
}

export function createTransport(
  { polite }: { polite: boolean },
  handlers: {
    onMessage: (payload: string) => void;
    onState: (state: TransportState) => void;
  },
): Transport {
  const peer = new RTCPeerConnection({ iceServers: [{ urls: STUN_URL }] });
  let channel: RTCDataChannel | null = null;
  let state: TransportState = 'idle';
  let queue: string[] = [];

  const setState = (next: TransportState) => {
    if (state === next) return;
    state = next;
    handlers.onState(next);
  };

  const attach = (next: RTCDataChannel) => {
    channel = next;
    next.onopen = () => {
      setState('open');
      // Anything queued while the channel was connecting goes out in order.
      const pending = queue;
      queue = [];
      for (const payload of pending) next.send(payload);
    };
    next.onclose = () => setState('closed');
    next.onmessage = (event) => {
      if (typeof event.data === 'string') handlers.onMessage(event.data);
    };
  };

  peer.ondatachannel = (event) => attach(event.channel);
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed') setState('closed');
    if (peer.connectionState === 'connecting') setState('connecting');
  };

  const gathered = new Promise<void>((resolve) => {
    const done = () => resolve();
    peer.onicegatheringstatechange = () => {
      if (peer.iceGatheringState === 'complete') done();
    };
    // A network that never finishes gathering must not block the code.
    setTimeout(done, GATHER_TIMEOUT_MS);
  });

  const describe = async (mode: 'offer' | 'answer'): Promise<Wire> => {
    await gathered;
    const description = peer.localDescription;
    if (!description) throw new Error('The connection could not be prepared.');
    return { description: description.toJSON(), candidates: [], mode };
  };

  return {
    get state() {
      return state;
    },
    async localCode() {
      if (!channel && !polite) {
        attach(peer.createDataChannel('wave-sync', { ordered: true }));
        setState('gathering');
        await peer.setLocalDescription(await peer.createOffer());
        const wire = await describe('offer');
        setState('waiting');
        const { encodeSignal } = await import('./signal');
        return encodeSignal(wire);
      }
      setState('waiting');
      const wire = await describe('answer');
      const { encodeSignal } = await import('./signal');
      return encodeSignal(wire);
    },
    async acceptCode(code) {
      const { decodeSignal } = await import('./signal');
      const wire = await decodeSignal<Wire>(code);
      setState('connecting');
      if (wire.mode === 'offer') {
        // The guest only ever answers: it is the side that pasted a code.
        await peer.setRemoteDescription(wire.description);
        for (const candidate of wire.candidates) await peer.addIceCandidate(candidate);
        await peer.setLocalDescription(await peer.createAnswer());
        return this.localCode();
      }
      await peer.setRemoteDescription(wire.description);
      for (const candidate of wire.candidates) await peer.addIceCandidate(candidate);
      return null;
    },
    send(payload: string) {
      if (channel?.readyState === 'open') channel.send(payload);
      else if (state !== 'closed' && state !== 'idle') queue.push(payload);
    },
    receive(handler) {
      handlers.onMessage = handler;
    },
    onState(handler) {
      handlers.onState = handler;
    },
    close() {
      setState('closed');
      try {
        channel?.close();
      } catch {
        // Already closed.
      }
      peer.close();
    },
  };
}
