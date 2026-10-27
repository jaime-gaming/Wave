/**
 * Signal analysis used by Mix.
 *
 * Everything here is pure DSP: no DOM, no Web Audio, no storage. It runs in a
 * worker on a decoded mono copy of the song, so the original file is never
 * touched, resampled or written back. Analysis is used only to choose *where* and
 * *how* to blend two songs.
 *
 * The results are estimates. Every consumer must treat low confidence as
 * "unknown" instead of inventing a beat grid.
 */

/** Frequency bands already matched to what matters for mixing. */
export interface BandEnergies {
  /** 20–160 Hz: kick and bass. */
  bass: number;
  /** 160–500 Hz: low mids, snare body. */
  low: number;
  /** 500–2000 Hz: vocals and most instruments. */
  mid: number;
  /** 2000–5000 Hz: presence, consonants, hi-hats. */
  high: number;
}

export interface FrameFeatures {
  rms: number;
  bands: BandEnergies;
  /** Share of energy above the bass band, 0–1. */
  brightness: number;
}

export interface Beats {
  bpm: number;
  /** Seconds from the start of the file to the first beat. */
  offset: number;
  /** 0–1; below ~0.35 the grid should be treated as unknown. */
  confidence: number;
}

export interface EnergySegment {
  start: number;
  end: number;
  /** Average RMS of the segment, 0–1 scaled by the file peak. */
  level: number;
  kind: 'intro' | 'build' | 'body' | 'breakdown' | 'outro';
}

export interface VocalRegion {
  start: number;
  end: number;
  /** 0–1 heuristic likelihood that a lead voice is present. */
  strength: number;
}

export interface TrackAnalysis {
  /** Seconds covered by the analysis (the whole file unless truncated). */
  duration: number;
  /** Seconds per analysis frame. */
  frameSeconds: number;
  beats: Beats;
  /** Audible start and end after trimming near-digital silence. */
  trimmed: { start: number; end: number };
  segments: EnergySegment[];
  vocals: VocalRegion[];
  /** Average band balance, useful for a bass-swap decision. */
  profile: BandEnergies;
  /** Largest RMS in the file, used to normalise levels. */
  peak: number;
}

const BASS = [20, 160] as const;
const LOW = [160, 500] as const;
const MID = [500, 2000] as const;
const HIGH = [2000, 5000] as const;

/** In-place iterative radix-2 FFT with precomputed tables. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Hann window, cached per length. */
const windows = new Map<number, Float32Array>();
function hann(size: number): Float32Array {
  let window = windows.get(size);
  if (!window) {
    window = new Float32Array(size);
    for (let index = 0; index < size; index++)
      window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
    windows.set(size, window);
  }
  return window;
}

function bandEnergy(
  magnitudes: Float32Array,
  binHz: number,
  [low, high]: readonly [number, number],
): number {
  const from = Math.max(1, Math.floor(low / binHz));
  const to = Math.min(magnitudes.length - 1, Math.ceil(high / binHz));
  let sum = 0;
  for (let bin = from; bin <= to; bin++) sum += magnitudes[bin] * magnitudes[bin];
  return sum;
}

export interface FrameOptions {
  frameSize?: number;
  hopSize?: number;
}

/**
 * Frame-level features: RMS, four band energies and brightness. Cost is linear
 * in the number of frames; a five-minute song at 11 kHz takes a few hundred
 * milliseconds.
 */
export function frameFeatures(
  samples: Float32Array,
  sampleRate: number,
  options: FrameOptions = {},
): { frames: FrameFeatures[]; frameSeconds: number } {
  const frameSize = options.frameSize ?? 1024;
  const hopSize = options.hopSize ?? 256;
  const window = hann(frameSize);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  const magnitudes = new Float32Array(frameSize / 2 + 1);
  const binHz = sampleRate / frameSize;
  const frames: FrameFeatures[] = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    let sum = 0;
    for (let index = 0; index < frameSize; index++) {
      const sample = samples[start + index];
      sum += sample * sample;
      re[index] = sample * window[index];
      im[index] = 0;
    }
    fft(re, im);
    for (let bin = 0; bin < magnitudes.length; bin++)
      magnitudes[bin] = Math.hypot(re[bin], im[bin]) / frameSize;
    const bands: BandEnergies = {
      bass: bandEnergy(magnitudes, binHz, BASS),
      low: bandEnergy(magnitudes, binHz, LOW),
      mid: bandEnergy(magnitudes, binHz, MID),
      high: bandEnergy(magnitudes, binHz, HIGH),
    };
    const total = bands.bass + bands.low + bands.mid + bands.high;
    frames.push({
      rms: Math.sqrt(sum / frameSize),
      bands,
      brightness: total > 0 ? (bands.mid + bands.high) / total : 0,
    });
  }
  return { frames, frameSeconds: hopSize / sampleRate };
}

/**
 * Spectral-flux onset envelope: only positive energy changes count, which is
 * what makes a beat visible even in a dense mix.
 */
export function onsetEnvelope(frames: FrameFeatures[]): Float32Array {
  const envelope = new Float32Array(frames.length);
  for (let index = 1; index < frames.length; index++) {
    const now = frames[index].bands;
    const before = frames[index - 1].bands;
    const flux =
      Math.max(0, now.bass - before.bass) +
      Math.max(0, now.low - before.low) +
      Math.max(0, now.mid - before.mid) +
      Math.max(0, now.high - before.high);
    envelope[index] = flux;
  }
  return envelope;
}

function normalise(values: Float32Array): Float32Array {
  let max = 0;
  for (const value of values) max = Math.max(max, value);
  if (max <= 0) return values;
  const out = new Float32Array(values.length);
  for (let index = 0; index < values.length; index++) out[index] = values[index] / max;
  return out;
}

/**
 * Tempo from autocorrelation of the onset envelope, with a preference around
 * 120 BPM to resolve the usual half/double-tempo ambiguity.
 */
export function estimateTempo(
  onset: Float32Array,
  frameSeconds: number,
  minBpm = 70,
  maxBpm = 190,
): Beats {
  const empty: Beats = { bpm: 0, offset: 0, confidence: 0 };
  if (onset.length < 16 || !Number.isFinite(frameSeconds) || frameSeconds <= 0) return empty;
  let mean = 0;
  for (const value of onset) mean += value;
  mean /= onset.length;
  const centred = new Float32Array(onset.length);
  for (let index = 0; index < onset.length; index++) centred[index] = onset[index] - mean;

  const minLag = Math.max(2, Math.round(60 / maxBpm / frameSeconds));
  const maxLag = Math.min(centred.length - 4, Math.round(60 / minBpm / frameSeconds));
  if (maxLag <= minLag) return empty;

  let bestLag = 0;
  let bestScore = 0;
  let total = 0;
  let count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let index = 0; index + lag < centred.length; index++)
      sum += centred[index] * centred[index + lag];
    const score = sum / (centred.length - lag);
    total += Math.abs(score);
    count++;
    // Slight preference for the musical middle so 60 and 180 BPM do not win.
    const bpm = 60 / (lag * frameSeconds);
    const prior = 1 - Math.min(0.35, Math.abs(Math.log2(bpm / 120)) * 0.22);
    if (score * prior > bestScore) {
      bestScore = score * prior;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return empty;

  // Parabolic interpolation around the peak improves the estimate by a few BPM.
  const corr = (lag: number) => {
    let sum = 0;
    for (let index = 0; index + lag < centred.length; index++)
      sum += centred[index] * centred[index + lag];
    return sum / Math.max(1, centred.length - lag);
  };
  const left = corr(bestLag - 1);
  const centre = corr(bestLag);
  const right = corr(bestLag + 1);
  const denominator = left - 2 * centre + right;
  const shift = denominator !== 0 ? (0.5 * (left - right)) / denominator : 0;
  const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = 60 / (refinedLag * frameSeconds);
  const confidence = Math.max(0, Math.min(1, bestScore / (total / Math.max(1, count) + bestScore)));
  return {
    bpm: Math.round(bpm * 10) / 10,
    offset: Math.round(estimatePhase(onset, refinedLag) * frameSeconds * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/** Where inside one beat period the strongest onsets land, in frames. */
export function estimatePhase(onset: Float32Array, periodInFrames: number): number {
  const bins = 64;
  const histogram = new Float32Array(bins);
  for (let index = 0; index < onset.length; index++) {
    if (onset[index] <= 0) continue;
    const phase = (index % periodInFrames) / periodInFrames;
    histogram[Math.min(bins - 1, Math.floor(phase * bins))] += onset[index];
  }
  let best = 0;
  for (let bin = 1; bin < bins; bin++) if (histogram[bin] > histogram[best]) best = bin;
  return (best / bins) * periodInFrames;
}

/** Aligns a time to the nearest beat of a grid, or returns it unchanged. */
export function snapToBeat(time: number, beats: Beats): number {
  if (!beats.bpm || beats.confidence < 0.35) return Math.max(0, time);
  const period = 60 / beats.bpm;
  if (!Number.isFinite(period) || period <= 0) return Math.max(0, time);
  const beatsFromStart = (time - beats.offset) / period;
  return Math.max(0, beats.offset + Math.round(beatsFromStart) * period);
}

/** Silence bounds from frame RMS, thresholded relative to the file peak. */
export function silenceBounds(
  frames: FrameFeatures[],
  frameSeconds: number,
  thresholdRatio = 0.02,
): { start: number; end: number } {
  if (!frames.length) return { start: 0, end: 0 };
  const peak = Math.max(...frames.map((frame) => frame.rms));
  const threshold = peak * thresholdRatio;
  let first = 0;
  while (first < frames.length && frames[first].rms <= threshold) first++;
  let last = frames.length - 1;
  while (last > first && frames[last].rms <= threshold) last--;
  return {
    start: first * frameSeconds,
    end: Math.min(frames.length * frameSeconds, (last + 1) * frameSeconds),
  };
}

function smooth(values: number[], radius: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < values.length; index++) {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const value = values[index + offset];
      if (value !== undefined) {
        sum += value;
        count++;
      }
    }
    out.push(count ? sum / count : 0);
  }
  return out;
}

/**
 * Splits the song into coarse energy blocks (intro, build, body, breakdown,
 * outro). Block boundaries are where the smoothed level changes by more than
 * 35 %, which is what a listener hears as a section change.
 */
export function energySegments(frames: FrameFeatures[], frameSeconds: number): EnergySegment[] {
  if (!frames.length) return [];
  const peak = Math.max(...frames.map((frame) => frame.rms)) || 1;
  const levels = smooth(
    frames.map((frame) => frame.rms / peak),
    Math.max(1, Math.round(1.2 / frameSeconds)),
  );
  const blocks: { start: number; end: number; level: number }[] = [];
  const minBlock = Math.max(2, Math.round(3 / frameSeconds));
  let start = 0;
  let reference = levels[0] || 0;
  for (let index = 1; index < levels.length; index++) {
    const changed = Math.abs(levels[index] - reference) > 0.35 * Math.max(0.08, reference);
    if (changed && index - start >= minBlock) {
      const slice = levels.slice(start, index);
      blocks.push({
        start: start * frameSeconds,
        end: index * frameSeconds,
        level: slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length),
      });
      start = index;
      reference = levels[index];
    }
  }
  const tail = levels.slice(start);
  blocks.push({
    start: start * frameSeconds,
    end: frames.length * frameSeconds,
    level: tail.reduce((sum, value) => sum + value, 0) / Math.max(1, tail.length),
  });

  // Keep the structure readable: never more than 24 blocks.
  const stride = Math.max(1, Math.ceil(blocks.length / 24));
  const reduced = stride === 1 ? blocks : blocks.filter((_, index) => index % stride === 0);

  return reduced.map((block, index) => {
    const previous = reduced[index - 1];
    let kind: EnergySegment['kind'];
    if (index === 0 && block.level < 0.55) kind = 'intro';
    else if (index === reduced.length - 1 && block.level < 0.55) kind = 'outro';
    else if (block.level >= 0.62 && (!previous || previous.level < block.level * 0.8))
      kind = 'build';
    else if (block.level < 0.42) kind = 'breakdown';
    else kind = 'body';
    return {
      start: Math.round(block.start * 100) / 100,
      end: Math.round(block.end * 100) / 100,
      level: Math.round(block.level * 100) / 100,
      kind,
    };
  });
}

/**
 * Regions likely to contain a lead voice, from the share of energy in the vocal
 * band plus brightness. This is a heuristic, not a transcription; mix decisions
 * that rely on it are always reversible and low-risk.
 */
export function vocalRegions(
  frames: FrameFeatures[],
  frameSeconds: number,
  threshold = 0.42,
): VocalRegion[] {
  if (!frames.length) return [];
  const peak = Math.max(...frames.map((frame) => frame.rms)) || 1;
  const presence = frames.map((frame) => {
    const { bands } = frame;
    const total = bands.bass + bands.low + bands.mid + bands.high;
    if (total <= 0) return 0;
    const vocalBand = (bands.mid + bands.high) / total;
    const loud = frame.rms / peak;
    return loud > 0.08 ? vocalBand * (0.6 + 0.4 * loud) : 0;
  });
  const smoothed = smooth(presence, Math.max(1, Math.round(0.35 / frameSeconds)));
  const regions: VocalRegion[] = [];
  let runStart = -1;
  let runStrength = 0;
  let runCount = 0;
  for (let index = 0; index <= smoothed.length; index++) {
    const active = index < smoothed.length && smoothed[index] >= threshold;
    if (active) {
      if (runStart < 0) {
        runStart = index;
        runStrength = 0;
        runCount = 0;
      }
      runStrength += smoothed[index];
      runCount++;
    } else if (runStart >= 0) {
      const start = runStart * frameSeconds;
      const end = index * frameSeconds;
      if (end - start >= 0.35)
        regions.push({
          start: Math.round(start * 100) / 100,
          end: Math.round(end * 100) / 100,
          strength: Math.round(Math.min(1, runStrength / Math.max(1, runCount)) * 100) / 100,
        });
      runStart = -1;
    }
  }
  return regions;
}

/** Full analysis for one decoded mono track. */
export function analyzePcm(
  samples: Float32Array,
  sampleRate: number,
  options: FrameOptions = {},
): TrackAnalysis {
  const { frames, frameSeconds } = frameFeatures(samples, sampleRate, options);
  const duration = samples.length / sampleRate;
  const onset = normalise(onsetEnvelope(frames));
  const beats = estimateTempo(onset, frameSeconds);
  const peak = frames.reduce((max, frame) => Math.max(max, frame.rms), 0);
  const totals: BandEnergies = { bass: 0, low: 0, mid: 0, high: 0 };
  for (const frame of frames) {
    totals.bass += frame.bands.bass;
    totals.low += frame.bands.low;
    totals.mid += frame.bands.mid;
    totals.high += frame.bands.high;
  }
  const grand = totals.bass + totals.low + totals.mid + totals.high || 1;
  return {
    duration: Math.round(duration * 100) / 100,
    frameSeconds,
    beats,
    trimmed: silenceBounds(frames, frameSeconds),
    segments: energySegments(frames, frameSeconds),
    vocals: vocalRegions(frames, frameSeconds),
    profile: {
      bass: Math.round((totals.bass / grand) * 100) / 100,
      low: Math.round((totals.low / grand) * 100) / 100,
      mid: Math.round((totals.mid / grand) * 100) / 100,
      high: Math.round((totals.high / grand) * 100) / 100,
    },
    peak: Math.round(peak * 1000) / 1000,
  };
}

/** Where the first sustained body section starts, bounded to the audible part. */
export function introEnd(analysis: TrackAnalysis): number {
  const body = analysis.segments.find(
    (segment) => segment.kind === 'body' || segment.kind === 'build',
  );
  return Math.max(analysis.trimmed.start, body?.start ?? analysis.trimmed.start);
}

/** Where the last full-energy section ends, i.e. where the outro begins. */
export function outroStart(analysis: TrackAnalysis): number {
  const segments = analysis.segments;
  const lastBody = [...segments].reverse().find((segment) => segment.kind === 'body');
  const value = lastBody?.end ?? analysis.trimmed.end;
  return Math.min(analysis.trimmed.end, value);
}

export function overlapsRegion(
  regions: VocalRegion[],
  start: number,
  end: number,
  minOverlap = 0.15,
): boolean {
  return regions.some(
    (region) => Math.min(end, region.end) - Math.max(start, region.start) > minOverlap,
  );
}
