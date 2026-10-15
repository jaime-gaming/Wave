/** Low-resolution source analysis; native output samples remain untouched. */
export interface EnergyEnvelope {
  step: number;
  values: Float32Array;
}
export function amplitudeEnvelope(channels: Float32Array[], sampleRate: number): EnergyEnvelope {
  const step = 0.1,
    length = channels[0]?.length ?? 0,
    frames = Math.max(1, Math.round(sampleRate * step));
  const values = new Float32Array(Math.ceil(length / frames));
  for (let bin = 0; bin < values.length; bin++) {
    let sum = 0,
      count = 0;
    for (const channel of channels)
      for (let i = bin * frames; i < Math.min(length, (bin + 1) * frames); i++) {
        sum += channel[i] ** 2;
        count++;
      }
    values[bin] = Math.min(1, Math.sqrt(count ? sum / count : 0) * 4);
  }
  return { step, values };
}
export function energyAt(envelope: EnergyEnvelope | undefined, time: number): number {
  if (!envelope || !Number.isFinite(time) || time < 0) return 0;
  const pos = time / envelope.step,
    i = Math.floor(pos),
    a = envelope.values[i] ?? 0,
    b = envelope.values[i + 1] ?? a;
  return a + (b - a) * (pos - i);
}
