/** Non-destructive, peak-bounded gain. This is not denoising or mastering. */
export interface VolumeFix {
  gain: number;
  rmsDb: number;
  peakDb: number;
  measuredAt: number;
}
export function volumeCorrection(
  channels: Float32Array[],
  sampleRate: number,
): Omit<VolumeFix, 'measuredAt'> {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw Error('No audio to measure.');
  const frames = Math.min(...channels.map((channel) => channel.length));
  const block = Math.max(1, Math.round(sampleRate * 0.4));
  const energies: number[] = [];
  let peak = 0;
  for (let start = 0; start < frames; start += block) {
    let sum = 0;
    const end = Math.min(frames, start + block);
    for (const channel of channels)
      for (let i = start; i < end; i++) {
        const value = channel[i];
        if (!Number.isFinite(value)) throw Error('Audio could not be measured safely.');
        peak = Math.max(peak, Math.abs(value));
        sum += value * value;
      }
    energies.push(sum / ((end - start) * channels.length));
  }
  const maximum = energies.reduce((max, value) => Math.max(max, value), 0);
  // Ignore silence and blocks more than 20 dB below the loudest passage.
  const audible = energies.filter((value) => value > Math.max(1e-8, maximum * 0.01));
  if (!audible.length || peak < 0.0001)
    throw Error('This recording is silent or too quiet to measure safely.');
  const rms = Math.sqrt(audible.reduce((a, b) => a + b, 0) / audible.length);
  const gain = Math.min(8, Math.pow(10, -18 / 20) / rms, Math.pow(10, -1 / 20) / peak);
  return { gain, rmsDb: 20 * Math.log10(rms), peakDb: 20 * Math.log10(peak) };
}
