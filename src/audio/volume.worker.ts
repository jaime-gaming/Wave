import { volumeCorrection } from './volumeAnalysis';
self.onmessage = (event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    self.postMessage({ result: volumeCorrection(event.data.channels, event.data.sampleRate) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Volume analysis failed.' });
  }
};
