import { spectrumBands } from '../domain/musicSpectrum';
/** A read-only tap of a native media element; never reroutes its audible output. */
export class MusicAnalyzer {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(2048);
  private frequencies = new Float32Array(1024);
  constructor(element: HTMLAudioElement) {
    const capture = (element as HTMLAudioElement & { captureStream?: () => MediaStream })
      .captureStream;
    if (!capture || typeof AudioContext === 'undefined') throw Error('Capture unavailable');
    try {
      this.stream = capture.call(element);
      if (!this.stream.getAudioTracks().length) throw Error('Capture not ready');
      this.context = new AudioContext({ latencyHint: 'playback' });
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = this.samples.length;
      this.source = this.context.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      // No destination connection: the original element is still the only output.
      void this.context.resume().catch(() => undefined);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  read() {
    if (!this.analyser || this.context?.state !== 'running') return undefined;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }
  readBands() {
    if (!this.analyser || this.context?.state !== 'running') return;
    this.analyser.getFloatFrequencyData(this.frequencies);
    return spectrumBands(this.frequencies, this.context.sampleRate, this.analyser.fftSize);
  }
  setVisible(visible: boolean) {
    if (visible && this.context?.state === 'suspended')
      void this.context.resume().catch(() => undefined);
    else if (!visible && this.context?.state === 'running')
      void this.context.suspend().catch(() => undefined);
  }
  dispose() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => undefined);
  }
}
