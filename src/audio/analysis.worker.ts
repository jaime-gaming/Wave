import { analyzePcm, type TrackAnalysis } from './dsp';

interface AnalyseRequest {
  id: number;
  samples: Float32Array;
  sampleRate: number;
}
interface AnalyseResponse {
  id: number;
  analysis?: TrackAnalysis;
  error?: string;
}

self.onmessage = (event: MessageEvent<AnalyseRequest>) => {
  const { id, samples, sampleRate } = event.data;
  try {
    const analysis = analyzePcm(samples, sampleRate);
    const response: AnalyseResponse = { id, analysis };
    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: AnalyseResponse = {
      id,
      error: error instanceof Error ? error.message : 'Analysis failed.',
    };
    (self as unknown as Worker).postMessage(response);
  }
};
