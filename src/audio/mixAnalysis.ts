/**
 * Background analysis pipeline for Mix.
 *
 * Decoding happens on a short, bounded copy (mono, 11 kHz) so a 200 MB FLAC is
 * never held fully decoded in memory: OfflineAudioContext resamples and mixes to
 * mono for us. The DSP itself runs in a worker, so scrolling and playback stay
 * smooth while a song is analysed.
 *
 * Nothing here touches the stored file.
 */
import { analyzePcm, type TrackAnalysis } from './dsp';

/** Analysis sample rate: enough for BPM, bands and vocals, cheap to compute. */
export const ANALYSIS_SAMPLE_RATE = 11_025;
/** Skip analysis for very large or very long files; the planner then falls back. */
export const MAX_ANALYSIS_BYTES = 60 * 1024 * 1024;
export const MAX_ANALYSIS_SECONDS = 15 * 60;

const cache = new Map<Blob, TrackAnalysis>();
const pending = new Map<Blob, Promise<TrackAnalysis | undefined>>();

export function cachedAnalysis(blob: Blob | undefined): TrackAnalysis | undefined {
  return blob ? cache.get(blob) : undefined;
}

export function cacheAnalysis(blob: Blob, analysis: TrackAnalysis): void {
  cache.set(blob, analysis);
}

export function clearAnalysisCache(): void {
  cache.clear();
  pending.clear();
}

type Client = {
  run: (samples: Float32Array, sampleRate: number) => Promise<TrackAnalysis>;
  terminate: () => void;
};

let client: Client | null | undefined;

function createClient(): Client | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    const queue = new Map<
      number,
      { resolve: (analysis: TrackAnalysis) => void; reject: (error: Error) => void }
    >();
    let nextId = 1;
    worker.onmessage = (
      event: MessageEvent<{ id: number; analysis?: TrackAnalysis; error?: string }>,
    ) => {
      const entry = queue.get(event.data.id);
      if (!entry) return;
      queue.delete(event.data.id);
      if (event.data.analysis) entry.resolve(event.data.analysis);
      else entry.reject(new Error(event.data.error ?? 'Analysis failed.'));
    };
    worker.onerror = () => {
      for (const entry of queue.values()) entry.reject(new Error('Analysis worker failed.'));
      queue.clear();
    };
    return {
      run: (samples, sampleRate) =>
        new Promise<TrackAnalysis>((resolve, reject) => {
          const id = nextId++;
          queue.set(id, { resolve, reject });
          // The buffer is transferred, not copied: no second copy in memory.
          worker.postMessage({ id, samples, sampleRate }, [samples.buffer]);
        }),
      terminate: () => worker.terminate(),
    };
  } catch {
    return null;
  }
}

function analysisClient(): Client | null {
  if (client === undefined) client = createClient();
  return client;
}

/** Decodes to mono at ANALYSIS_SAMPLE_RATE. Returns null when unsupported. */
export async function decodeForAnalysis(
  blob: Blob,
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  if (blob.size > MAX_ANALYSIS_BYTES) return null;
  try {
    const probe = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);
    const buffer = await probe.decodeAudioData(await blob.arrayBuffer());
    if (!(buffer.duration > 0) || buffer.duration > MAX_ANALYSIS_SECONDS) return null;
    // Mix to mono: the analysis does not care about stereo placement.
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index++) mono[index] += data[index];
    }
    const divisor = Math.max(1, buffer.numberOfChannels);
    for (let index = 0; index < length; index++) mono[index] /= divisor;
    return { samples: mono, sampleRate: buffer.sampleRate };
  } catch {
    return null;
  }
}

/** Analyse a song once; concurrent calls share the work. */
export async function analyzeTrack(blob: Blob): Promise<TrackAnalysis | undefined> {
  const done = cache.get(blob);
  if (done) return done;
  const running = pending.get(blob);
  if (running) return running;
  const work = (async () => {
    const decoded = await decodeForAnalysis(blob);
    if (!decoded) return undefined;
    const runner = analysisClient();
    try {
      const analysis = runner
        ? await runner.run(decoded.samples, decoded.sampleRate)
        : analyzePcm(decoded.samples, decoded.sampleRate);
      cache.set(blob, analysis);
      return analysis;
    } catch {
      // A worker failure must not break playback: analyse on the main thread once.
      try {
        const analysis = analyzePcm(decoded.samples, decoded.sampleRate);
        cache.set(blob, analysis);
        return analysis;
      } catch {
        return undefined;
      }
    }
  })();
  pending.set(blob, work);
  work.finally(() => pending.delete(blob));
  return work;
}

/** Fire-and-forget warm-up used when a song becomes current or next. */
export function primeAnalysis(blob: Blob | undefined): void {
  if (!blob || cache.has(blob) || pending.has(blob)) return;
  void analyzeTrack(blob);
}

export function isAnalysing(blob: Blob | undefined): boolean {
  return !!blob && pending.has(blob);
}
