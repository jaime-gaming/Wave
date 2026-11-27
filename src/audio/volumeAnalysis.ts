export const VOLUME_FIX_VERSION = 2;

export const TARGET_LUFS = -11.0;

export const BALANCED_MIN_LUFS = -13.0;
export const BALANCED_MAX_LUFS = -7.5;

export const HOT_CEILING_LUFS = -8.5;

export const MAX_BOOST_LINEAR = 5.0;

export const MIN_ATTENUATION_LINEAR = 0.55;

export const MIN_GAIN_DELTA_DB = 0.6;

export type VolumeFixAction = 'boost' | 'trim' | 'balanced';

export interface VolumeFix {
  gain: number;
  rmsDb: number;
  peakDb: number;

  lufs?: number;

  applied?: boolean;

  limiterAssisted?: boolean;
  action?: VolumeFixAction;
  algorithmVersion?: number;
  measuredAt: number;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function kWeightHighShelf(sampleRate: number): Biquad {
  const fc = Math.min(1681.974450955533, sampleRate * 0.42);
  const dbGain = 3.999843853973347;
  const q = 0.7071752369554196;
  const a = Math.pow(10, dbGain / 40);
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = (sin / 2) * Math.sqrt((a + 1 / a) * (1 / q - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(a) * alpha;

  const b0 = a * (a + 1 + (a - 1) * cos + twoSqrtAAlpha);
  const b1 = -2 * a * (a - 1 + (a + 1) * cos);
  const b2 = a * (a + 1 + (a - 1) * cos - twoSqrtAAlpha);
  const a0 = a + 1 - (a - 1) * cos + twoSqrtAAlpha;
  const a1 = 2 * (a - 1 - (a + 1) * cos);
  const a2 = a + 1 - (a - 1) * cos - twoSqrtAAlpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function kWeightHighPass(sampleRate: number): Biquad {
  const fc = Math.min(38.13547087602444, sampleRate * 0.25);
  const q = 0.5003270373238773;
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);

  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(input: Float32Array, frames: number, f: Biquad, out: Float32Array): void {
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  const { b0, b1, b2, a1, a2 } = f;
  for (let i = 0; i < frames; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
}

function estimateTruePeak(channel: Float32Array, frames: number): number {
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const s = channel[i];
    if (!Number.isFinite(s)) throw Error('Audio could not be measured safely.');
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
    if (i >= 1 && i + 2 < frames && abs > 0.25) {
      const mid =
        0.5625 * (channel[i] + channel[i + 1]) - 0.0625 * (channel[i - 1] + channel[i + 2]);
      const absMid = Math.abs(mid);
      if (absMid > peak) peak = absMid;
    }
  }
  return peak;
}

export function volumeCorrection(
  channels: Float32Array[],
  sampleRate: number,
): Omit<VolumeFix, 'measuredAt'> {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw Error('No audio to measure.');
  const frames = Math.min(...channels.map((channel) => channel.length));
  if (frames <= 0) throw Error('No audio to measure.');

  const shelf = kWeightHighShelf(sampleRate);
  const hp = kWeightHighPass(sampleRate);

  let peak = 0;
  const weightedChannels: Float32Array[] = [];
  const temp = new Float32Array(frames);

  for (const channel of channels) {
    const chPeak = estimateTruePeak(channel, frames);
    if (chPeak > peak) peak = chPeak;
    applyBiquad(channel, frames, shelf, temp);
    const filtered = new Float32Array(frames);
    applyBiquad(temp, frames, hp, filtered);
    weightedChannels.push(filtered);
  }

  if (peak < 0.0001) throw Error('This recording is silent or too quiet to measure safely.');

  const blockSize = Math.max(1, Math.min(frames, Math.round(sampleRate * 0.4)));
  const hopSize = Math.max(1, Math.round(blockSize / 4));
  const blockEnergies: number[] = [];
  const rawEnergies: number[] = [];

  for (let start = 0; start < frames; start += hopSize) {
    const end = Math.min(frames, start + blockSize);
    const count = end - start;
    if (count < blockSize / 2 && blockEnergies.length > 0) break;
    let kSum = 0;
    let rawSum = 0;
    for (let c = 0; c < channels.length; c++) {
      const kCh = weightedChannels[c];
      const rCh = channels[c];
      let chKSum = 0;
      let chRawSum = 0;
      for (let i = start; i < end; i++) {
        const kv = kCh[i];
        const rv = rCh[i];
        chKSum += kv * kv;
        chRawSum += rv * rv;
      }

      kSum += chKSum / count;
      rawSum += chRawSum / count;
    }
    const meanK = kSum / channels.length;
    const meanRaw = rawSum / channels.length;
    blockEnergies.push(meanK);
    rawEnergies.push(meanRaw);
    if (end >= frames) break;
  }

  const fineWindow = Math.max(1, Math.round(sampleRate * 0.05));
  const shortPeaks: number[] = [];
  for (let start = 0; start < frames; start += fineWindow) {
    const end = Math.min(frames, start + fineWindow);
    let winPeak = 0;
    for (const ch of channels) {
      for (let i = start; i < end; i++) {
        const abs = Math.abs(ch[i]);
        if (abs > winPeak) winPeak = abs;
      }
    }
    if (winPeak > 0.001) shortPeaks.push(winPeak);
  }

  const maxRaw = rawEnergies.reduce((m, v) => Math.max(m, v), 0);
  const audibleRaw = rawEnergies.filter((v) => v > Math.max(1e-8, maxRaw * 0.01));
  if (!audibleRaw.length) throw Error('This recording is silent or too quiet to measure safely.');
  const rms = Math.sqrt(audibleRaw.reduce((a, b) => a + b, 0) / audibleRaw.length);
  const rmsDb = 20 * Math.log10(Math.max(1e-9, rms));
  const peakDb = 20 * Math.log10(Math.max(1e-9, peak));

  const absGateEnergy = Math.pow(10, (-70 + 0.691) / 10);
  const afterAbs = blockEnergies.filter((e) => e > absGateEnergy);
  if (!afterAbs.length) throw Error('This recording is silent or too quiet to measure safely.');
  const ungatedMean = afterAbs.reduce((a, b) => a + b, 0) / afterAbs.length;

  const relGateEnergy = ungatedMean * 0.1;
  const afterRel = afterAbs.filter((e) => e > relGateEnergy);
  const gatedMean = afterRel.length
    ? afterRel.reduce((a, b) => a + b, 0) / afterRel.length
    : ungatedMean;
  const lufs = -0.691 + 10 * Math.log10(Math.max(1e-12, gatedMean));

  shortPeaks.sort((a, b) => a - b);
  const sustainedPeak = shortPeaks.length
    ? shortPeaks[Math.min(shortPeaks.length - 1, Math.floor(shortPeaks.length * 0.9))]
    : peak;

  const linearCeiling = Math.pow(10, -1 / 20) / peak;
  let gain = 1;
  let action: VolumeFixAction = 'balanced';
  let applied = false;
  let limiterAssisted = false;

  if (lufs < BALANCED_MIN_LUFS) {
    const desiredGain = Math.min(MAX_BOOST_LINEAR, Math.pow(10, (TARGET_LUFS - lufs) / 20));
    if (desiredGain <= linearCeiling) {
      gain = desiredGain;
    } else if (sustainedPeak < peak * 0.72) {
      const sustainedCeiling = Math.pow(10, -1.5 / 20) / Math.max(sustainedPeak, 0.001);

      gain = Math.min(desiredGain, sustainedCeiling, Math.max(1, linearCeiling * 2.0));
      limiterAssisted = gain > linearCeiling;
    } else {
      gain = Math.max(1, Math.min(desiredGain, linearCeiling));
    }
    const deltaDb = 20 * Math.log10(gain);
    if (deltaDb >= MIN_GAIN_DELTA_DB) {
      applied = true;
      action = 'boost';
    } else {
      gain = 1;
      applied = false;
      limiterAssisted = false;
      action = 'balanced';
    }
  } else if (lufs > BALANCED_MAX_LUFS) {
    const desiredGain = Math.max(
      MIN_ATTENUATION_LINEAR,
      Math.pow(10, (HOT_CEILING_LUFS - lufs) / 20),
    );
    const peakSafe = Math.min(desiredGain, Math.max(MIN_ATTENUATION_LINEAR, linearCeiling));
    const deltaDb = Math.abs(20 * Math.log10(peakSafe));
    if (peakSafe < 1 && deltaDb >= MIN_GAIN_DELTA_DB) {
      gain = peakSafe;
      applied = true;
      action = 'trim';
    }
  }

  return {
    gain: Math.round(gain * 10000) / 10000,
    rmsDb: Math.round(rmsDb * 100) / 100,
    peakDb: Math.round(peakDb * 100) / 100,
    lufs: Math.round(lufs * 100) / 100,
    applied,
    limiterAssisted,
    action,
    algorithmVersion: VOLUME_FIX_VERSION,
  };
}
