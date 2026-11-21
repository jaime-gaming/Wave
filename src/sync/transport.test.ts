import { afterEach, expect, it, vi } from 'vitest';
import { createTransport, GATHER_TIMEOUT_MS } from './transport';
import { encodeSignal } from './signal';

class Peer {
  static last: Peer;
  iceGatheringState = 'gathering';
  localDescription: { toJSON: () => RTCSessionDescriptionInit } | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  ondatachannel = null;
  onconnectionstatechange = null;
  constructor() {
    Peer.last = this;
  }
  createDataChannel() {
    return { readyState: 'connecting', close: vi.fn() };
  }
  async createOffer() {
    return { type: 'offer', sdp: 'test' };
  }
  async setLocalDescription(value: RTCSessionDescriptionInit) {
    this.localDescription = { toJSON: () => value };
  }
  setRemoteDescription = vi.fn();
  close = vi.fn();
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('waits for ICE even when the pairing screen was opened long before the offer', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', Peer);
  const transport = createTransport({ polite: false }, { onMessage: vi.fn(), onState: vi.fn() });
  await vi.advanceTimersByTimeAsync(GATHER_TIMEOUT_MS * 2);
  let settled = false;
  const code = transport.localCode().then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBe(false);
  Peer.last.iceGatheringState = 'complete';
  Peer.last.onicegatheringstatechange?.();
  await code;
  expect(settled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  transport.close();
});
it('rejects malformed signaling before touching the remote description', async () => {
  vi.stubGlobal('RTCPeerConnection', Peer);
  const transport = createTransport({ polite: false }, { onMessage: vi.fn(), onState: vi.fn() });
  await expect(
    transport.acceptCode(
      await encodeSignal({
        mode: 'offer',
        description: { type: 'answer', sdp: 'test' },
        candidates: [],
      }),
    ),
  ).rejects.toThrow('Invalid connection code');
  expect(Peer.last.setRemoteDescription).not.toHaveBeenCalled();
  transport.close();
});

it('waits for an open channel and applies backpressure until its buffer drains', async () => {
  class Channel extends EventTarget {
    readyState = 'connecting';
    bufferedAmount = 0;
    bufferedAmountLowThreshold = 0;
    onopen?: () => void;
    onclose?: () => void;
    onerror?: () => void;
    onmessage?: () => void;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = 'closed';
      this.onclose?.();
      this.dispatchEvent(new Event('close'));
    });
  }
  class BufferedPeer extends Peer {
    static channel: Channel;
    override createDataChannel() {
      BufferedPeer.channel = new Channel();
      return BufferedPeer.channel;
    }
  }
  vi.stubGlobal('RTCPeerConnection', BufferedPeer);
  const transport = createTransport({ polite: false }, { onMessage: vi.fn(), onState: vi.fn() });
  const code = transport.localCode();
  Peer.last.iceGatheringState = 'complete';
  Peer.last.onicegatheringstatechange?.();
  await code;
  const channel = BufferedPeer.channel;
  const first = transport.send('first');
  await Promise.resolve();
  expect(channel.send).not.toHaveBeenCalled();
  channel.readyState = 'open';
  channel.onopen?.();
  await first;
  expect(channel.send).toHaveBeenCalledWith('first');
  channel.bufferedAmount = 600 * 1024;
  const second = transport.send('second');
  await Promise.resolve();
  expect(channel.send).toHaveBeenCalledTimes(1);
  channel.bufferedAmount = 100 * 1024;
  channel.dispatchEvent(new Event('bufferedamountlow'));
  await second;
  expect(channel.send).toHaveBeenLastCalledWith('second');
  transport.close();
});

it('rejects pending sends if the connection closes before opening', async () => {
  vi.stubGlobal('RTCPeerConnection', Peer);
  const transport = createTransport({ polite: false }, { onMessage: vi.fn(), onState: vi.fn() });
  const send = transport.send('hello');
  await Promise.resolve();
  transport.close();
  await expect(send).rejects.toThrow('closed');
});
