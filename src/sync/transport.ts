import { decodeSignal, encodeSignal } from './signal';

export type TransportState = 'idle' | 'gathering' | 'waiting' | 'connecting' | 'open' | 'closed';

export interface Transport {
  send: (payload: string) => Promise<void>;
  receive: (handler: (payload: string) => void) => void;
  onState: (handler: (state: TransportState) => void) => void;

  localCode: () => Promise<string>;

  acceptCode: (code: string) => Promise<string | null>;
  close: () => void;
  readonly state: TransportState;
}

export const STUN_URL = 'stun:stun.l.google.com:19302';

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
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: [STUN_URL, 'stun:stun.cloudflare.com:3478'] }],
  });
  let channel: RTCDataChannel | null = null;
  let state: TransportState = 'idle';
  let pendingOpen: {
    resolve: (channel: RTCDataChannel) => void;
    reject: (error: Error) => void;
  }[] = [];
  let sendTail: Promise<void> = Promise.resolve();
  const failPending = () => {
    const pending = pendingOpen;
    pendingOpen = [];
    for (const waiter of pending) waiter.reject(new Error('The connection closed.'));
  };

  const isClosed = () => state === 'closed';
  const setState = (next: TransportState) => {
    if (state === next || isClosed()) return;
    state = next;
    if (next === 'closed') failPending();
    handlers.onState(next);
  };

  const attach = (next: RTCDataChannel) => {
    channel = next;
    next.bufferedAmountLowThreshold = 256 * 1024;
    next.onopen = () => {
      setState('open');
      const pending = pendingOpen;
      pendingOpen = [];
      for (const waiter of pending) waiter.resolve(next);
    };
    next.onclose = () => setState('closed');
    next.onerror = () => setState('closed');
    next.onmessage = (event) => {
      if (typeof event.data === 'string') handlers.onMessage(event.data);
    };
  };

  peer.ondatachannel = (event) => attach(event.channel);
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed') setState('closed');
    if (peer.connectionState === 'connecting') setState('connecting');
  };

  const gather = () =>
    new Promise<void>((resolve) => {
      if (peer.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      let quiet: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        clearTimeout(timer);
        clearTimeout(quiet);
        peer.onicegatheringstatechange = null;
        peer.onicecandidate = null;
        resolve();
      };
      const timer = setTimeout(done, GATHER_TIMEOUT_MS);
      // Once a public candidate is available, allow a short quiet period for other
      // interfaces. Host-only candidates keep the full timeout for restrictive NATs.
      let hasPublicCandidate = false;
      peer.onicecandidate = (event) => {
        if (
          event.candidate?.candidate &&
          /\styp\s(?:srflx|relay)\b/u.test(event.candidate.candidate)
        )
          hasPublicCandidate = true;
        if (hasPublicCandidate && event.candidate) {
          clearTimeout(quiet);
          quiet = setTimeout(done, 1200);
        }
      };
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === 'complete') done();
      };
    });

  const describe = async (mode: 'offer' | 'answer'): Promise<Wire> => {
    await gather();
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
        return encodeSignal(wire);
      }
      setState('waiting');
      const wire = await describe('answer');
      return encodeSignal(wire);
    },
    async acceptCode(code) {
      const wire = await decodeSignal<Wire>(code);
      if (
        !wire ||
        !['offer', 'answer'].includes(wire.mode) ||
        wire.description?.type !== wire.mode ||
        typeof wire.description.sdp !== 'string' ||
        !Array.isArray(wire.candidates) ||
        wire.candidates.length > 256
      ) {
        throw new Error('Invalid connection code. Ask the other device for a new one.');
      }
      setState('connecting');
      if (wire.mode === 'offer') {
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
      const task = sendTail.then(async () => {
        if (state === 'closed') throw new Error('The connection closed.');
        const open =
          channel?.readyState === 'open'
            ? channel
            : await new Promise<RTCDataChannel>((resolve, reject) => {
                pendingOpen.push({ resolve, reject });
              });
        if (open.readyState !== 'open' || isClosed()) throw new Error('The connection closed.');
        if (open.bufferedAmount > 512 * 1024) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              open.removeEventListener('bufferedamountlow', low);
              open.removeEventListener('close', closed);
              open.removeEventListener('error', closed);
            };
            const low = () => {
              cleanup();
              resolve();
            };
            const closed = () => {
              cleanup();
              reject(new Error('The connection closed.'));
            };
            const timer = setTimeout(closed, 30_000);
            open.addEventListener('bufferedamountlow', low);
            open.addEventListener('close', closed);
            open.addEventListener('error', closed);
            if (open.readyState !== 'open') closed();
            else if (open.bufferedAmount <= open.bufferedAmountLowThreshold) low();
          });
        }
        if (open.readyState !== 'open' || isClosed()) throw new Error('The connection closed.');
        open.send(payload);
      });
      sendTail = task.catch(() => undefined);
      return task;
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
      } catch {}
      peer.close();
    },
  };
}
