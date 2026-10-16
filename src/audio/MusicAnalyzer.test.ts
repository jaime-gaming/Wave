import { afterEach, expect, it, vi } from 'vitest';
import { MusicAnalyzer } from './MusicAnalyzer';
afterEach(() => vi.unstubAllGlobals());
it('reads captured samples without attaching the original element or a destination', () => {
  const stop = vi.fn(),
    connect = vi.fn(),
    disconnect = vi.fn(),
    close = vi.fn().mockResolvedValue(undefined);
  const analyser = {
    fftSize: 0,
    disconnect: vi.fn(),
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.05),
  };
  const stream = { getAudioTracks: () => [{}], getTracks: () => [{ stop }] };
  const createMediaStreamSource = vi.fn(() => ({ connect, disconnect }));
  const createMediaElementSource = vi.fn();
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      destination = {};
      createMediaElementSource = createMediaElementSource;
      createMediaStreamSource = createMediaStreamSource;
      createAnalyser = () => analyser;
      close = close;
      resume = () => Promise.resolve();
    },
  );
  const element = {
    captureStream: () => stream,
    play: vi.fn(),
    pause: vi.fn(),
  } as unknown as HTMLAudioElement;
  const reader = new MusicAnalyzer(element);
  expect(reader.read()).toBeCloseTo(0.2);
  expect(createMediaStreamSource).toHaveBeenCalledWith(stream);
  expect(createMediaElementSource).not.toHaveBeenCalled();
  expect(connect).toHaveBeenCalledExactlyOnceWith(analyser);
  reader.dispose();
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(element.play).not.toHaveBeenCalled();
  expect(element.pause).not.toHaveBeenCalled();
});
it('fails cleanly when capture has no audio track yet', () => {
  const stop = vi.fn();
  vi.stubGlobal('AudioContext', vi.fn());
  const element = {
    captureStream: () => ({ getAudioTracks: () => [], getTracks: () => [{ stop }] }),
  } as unknown as HTMLAudioElement;
  expect(() => new MusicAnalyzer(element)).toThrow('Capture not ready');
  expect(stop).toHaveBeenCalledOnce();
  expect(AudioContext).not.toHaveBeenCalled();
});
