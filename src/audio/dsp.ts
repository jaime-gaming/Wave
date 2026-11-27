import { tempoStability } from './tempo';

export interface BandEnergies {
  bass: number;

  low: number;

  mid: number;

  high: number;
}

export interface FrameFeatures {
  rms: number;
  bands: BandEnergies;

  brightness: number;
}

export interface Beats {
  bpm: number;

  offset: number;

  confidence: number;

  stability?: number;
}

export interface EnergySegment {
  start: number;
  end: number;

  level: number;
  kind: 'intro' | 'build' | 'body' | 'breakdown' | 'outro';
}

export interface VocalRegion {
  start: number;
  end: number;

  strength: number;
}

export interface HarmonicKey {
  tonic: number;
  mode: 'major' | 'minor';

  name: string;

  camelot: string;

  confidence: number;
}

export interface TrackAnalysis {
  duration: number;

  frameSeconds: number;
  beats: Beats;

  trimmed: { start: number; end: number };
  segments: EnergySegment[];
  vocals: VocalRegion[];

  profile: BandEnergies;

  peak: number;

  key?: HarmonicKey;
}

const BASS = [20, 160] as const;
const LOW = [160, 500] as const;
const MID = [500, 2000] as const;
const HIGH = [2000, 5000] as const;

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

export function frameFeatures(
  samples: Float32Array,
  sampleRate: number,
  options: FrameOptions = {},
): { frames: FrameFeatures[]; frameSeconds: number; chroma: Float32Array } {
  const frameSize = options.frameSize ?? 1024;
  const hopSize = options.hopSize ?? 256;
  const window = hann(frameSize);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  const magnitudes = new Float32Array(frameSize / 2 + 1);
  const chroma = new Float32Array(12);
  const binHz = sampleRate / frameSize;
  const binPitchClass = new Int8Array(magnitudes.length);
  binPitchClass.fill(-1);
  for (let bin = 1; bin < magnitudes.length; bin++) {
    const hz = bin * binHz;
    if (hz >= 65 && hz <= 2000) {
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      binPitchClass[bin] = ((midi % 12) + 12) % 12;
    }
  }
  const frames: FrameFeatures[] = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    let sum = 0;
    for (let index = 0; index < frameSize; index++) {
      const sample = samples[start + index];
      sum += sample * sample;
      re[index] = sample * window[index];
      im[index] = 0;
    }
    const rms = Math.sqrt(sum / frameSize);
    fft(re, im);
    const tonal = rms > 0.01;
    for (let bin = 0; bin < magnitudes.length; bin++) {
      const mag = Math.hypot(re[bin], im[bin]) / frameSize;
      magnitudes[bin] = mag;
      if (tonal) {
        const pc = binPitchClass[bin];
        if (pc >= 0) chroma[pc] += mag * mag;
      }
    }
    const bands: BandEnergies = {
      bass: bandEnergy(magnitudes, binHz, BASS),
      low: bandEnergy(magnitudes, binHz, LOW),
      mid: bandEnergy(magnitudes, binHz, MID),
      high: bandEnergy(magnitudes, binHz, HIGH),
    };
    const total = bands.bass + bands.low + bands.mid + bands.high;
    frames.push({
      rms,
      bands,
      brightness: total > 0 ? (bands.mid + bands.high) / total : 0,
    });
  }
  return { frames, frameSeconds: hopSize / sampleRate, chroma };
}

const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1] as const;
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10] as const;
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearsonRotation(chroma: Float32Array, profile: number[], shift: number): number {
  let meanC = 0;
  let meanP = 0;
  for (let i = 0; i < 12; i++) {
    meanC += chroma[i];
    meanP += profile[i];
  }
  meanC /= 12;
  meanP /= 12;
  let num = 0;
  let denC = 0;
  let denP = 0;
  for (let i = 0; i < 12; i++) {
    const dc = chroma[(i + shift) % 12] - meanC;
    const dp = profile[i] - meanP;
    num += dc * dp;
    denC += dc * dc;
    denP += dp * dp;
  }
  const denom = Math.sqrt(denC * denP);
  return denom > 1e-9 ? num / denom : 0;
}

export function estimateKeyFromChroma(chroma: Float32Array): HarmonicKey | undefined {
  let total = 0;
  for (let i = 0; i < 12; i++) total += chroma[i];
  if (total <= 1e-12) return undefined;

  const norm = new Float32Array(12);
  for (let i = 0; i < 12; i++) norm[i] = chroma[i] / total;

  let bestR = -2;
  let secondR = -2;
  let bestTonic = 0;
  let bestMode: 'major' | 'minor' = 'major';

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor'] as const) {
      const r = pearsonRotation(norm, mode === 'major' ? KS_MAJOR : KS_MINOR, tonic);
      if (r > bestR) {
        secondR = bestR;
        bestR = r;
        bestTonic = tonic;
        bestMode = mode;
      } else if (r > secondR) {
        secondR = r;
      }
    }
  }

  if (bestR < 0.24) return undefined;
  const strength = Math.max(0, Math.min(1, (bestR - 0.14) / 0.62));
  const margin = Math.max(0.28, Math.min(1, (bestR - Math.max(0, secondR)) * 5 + 0.36));
  const confidence = Math.round(strength * margin * 1000) / 1000;
  const num = bestMode === 'major' ? CAMELOT_MAJOR[bestTonic] : CAMELOT_MINOR[bestTonic];
  const letter = bestMode === 'major' ? 'B' : 'A';
  return {
    tonic: bestTonic,
    mode: bestMode,
    name: `${PITCH_NAMES[bestTonic]} ${bestMode}`,
    camelot: `${num}${letter}`,
    confidence,
  };
}

export function harmonicCompatibility(a?: HarmonicKey, b?: HarmonicKey): number {
  const NEUTRAL = 0.62;
  if (!a || !b) return NEUTRAL;
  const reliability = Math.min(a.confidence, b.confidence);
  if (reliability < 0.2) return NEUTRAL;

  const numA = Number.parseInt(a.camelot, 10);
  const numB = Number.parseInt(b.camelot, 10);
  const letterA = a.camelot.slice(-1);
  const letterB = b.camelot.slice(-1);
  if (!Number.isFinite(numA) || !Number.isFinite(numB)) return NEUTRAL;

  const rawDiff = Math.abs(numA - numB);
  const wheelDist = Math.min(rawDiff, 12 - rawDiff);
  const sameMode = letterA === letterB;
  const forwardStep = (numB - numA + 12) % 12;

  let rawScore = 0.42;
  if (wheelDist === 0 && sameMode) rawScore = 1.0;
  else if (wheelDist === 0 && !sameMode) rawScore = 0.95;
  else if (wheelDist === 1 && sameMode) rawScore = 0.92;
  else if (wheelDist === 1 && !sameMode) rawScore = 0.8;
  else if (forwardStep === 2 && sameMode) rawScore = 0.78;
  else if (wheelDist === 2 && sameMode) rawScore = 0.72;
  else if (wheelDist === 3 && sameMode) rawScore = 0.58;
  else if (wheelDist >= 5) rawScore = 0.22;

  const weight = Math.max(0, Math.min(1, (reliability - 0.15) / 0.55));
  return Math.round((NEUTRAL + (rawScore - NEUTRAL) * weight) * 1000) / 1000;
}

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

    const bpm = 60 / (lag * frameSeconds);
    const prior = 1 - Math.min(0.35, Math.abs(Math.log2(bpm / 120)) * 0.22);
    if (score * prior > bestScore) {
      bestScore = score * prior;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return empty;

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

export function snapToBeat(time: number, beats: Beats): number {
  if (!beats.bpm || beats.confidence < 0.35) return Math.max(0, time);
  const period = 60 / beats.bpm;
  if (!Number.isFinite(period) || period <= 0) return Math.max(0, time);
  const beatsFromStart = (time - beats.offset) / period;
  return Math.max(0, beats.offset + Math.round(beatsFromStart) * period);
}

export const SILENCE_FLOOR = 0.004;

export function silenceBounds(
  frames: FrameFeatures[],
  frameSeconds: number,
  thresholdRatio = 0.02,
  sustainSeconds = 0.35,
): { start: number; end: number } {
  if (!frames.length) return { start: 0, end: 0 };
  const levels = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  const loudReference = levels[Math.min(levels.length - 1, Math.floor(levels.length * 0.9))];

  const threshold = Math.max(loudReference * thresholdRatio, SILENCE_FLOOR);
  const held = Math.max(1, Math.round(sustainSeconds / Math.max(frameSeconds, 0.001)));
  const audible = (index: number) => (frames[index]?.rms ?? 0) > threshold;

  const firstHeld = () => {
    let run = 0;
    for (let index = 0; index < frames.length; index++) {
      run = audible(index) ? run + 1 : 0;
      if (run >= held) return index - run + 1;
    }
    return frames.length;
  };

  const lastHeld = (from: number) => {
    let run = 0;
    for (let index = frames.length - 1; index >= from; index--) {
      run = audible(index) ? run + 1 : 0;
      if (run >= held) return index + run;
    }
    return from;
  };
  const total = frames.length * frameSeconds;
  const ceiling = Math.min(20, total / 4);
  const first = firstHeld();
  const last = lastHeld(first);
  if (last <= first) return { start: 0, end: total };

  const start = Math.min(first * frameSeconds, ceiling);
  const end = Math.max(last * frameSeconds, total - ceiling);
  return {
    start: Math.max(0, Math.round(start * 1000) / 1000),
    end: Math.min(total, Math.round(end * 1000) / 1000),
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

export function analyzePcm(
  samples: Float32Array,
  sampleRate: number,
  options: FrameOptions = {},
): TrackAnalysis {
  const { frames, frameSeconds, chroma } = frameFeatures(samples, sampleRate, options);
  const duration = samples.length / sampleRate;
  const onset = normalise(onsetEnvelope(frames));
  const beats: Beats = {
    ...estimateTempo(onset, frameSeconds),

    stability: tempoStability(onset, frameSeconds, estimateTempo),
  };
  const peak = frames.reduce((max, frame) => Math.max(max, frame.rms), 0);
  const totals: BandEnergies = { bass: 0, low: 0, mid: 0, high: 0 };
  for (const frame of frames) {
    totals.bass += frame.bands.bass;
    totals.low += frame.bands.low;
    totals.mid += frame.bands.mid;
    totals.high += frame.bands.high;
  }
  const grand = totals.bass + totals.low + totals.mid + totals.high || 1;
  const key = estimateKeyFromChroma(chroma);
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
    ...(key ? { key } : {}),
  };
}

export function kickStart(
  analysis: TrackAnalysis,
  from = introEnd(analysis),
  share = 0.55,
): number | null {
  const body = analysis.segments.filter(
    (segment) => segment.kind === 'body' || segment.kind === 'build',
  );
  if (!body.length) return null;
  const average = body.reduce((total, segment) => total + segment.level, 0) / body.length;
  if (average <= 0.01) return null;

  for (const segment of analysis.segments) {
    if (segment.end <= from) continue;
    if (segment.level >= average * share) return Math.max(from, segment.start);
  }
  return null;
}

export function introEnd(analysis: TrackAnalysis): number {
  const body = analysis.segments.find(
    (segment) => segment.kind === 'body' || segment.kind === 'build',
  );
  return Math.max(analysis.trimmed.start, body?.start ?? analysis.trimmed.start);
}

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
