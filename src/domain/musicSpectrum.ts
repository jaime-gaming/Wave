/** Frequency energy, not voice/instrument stem separation. No audio output processing. */
export interface MusicBands {
  bass: number;
  body: number;
  air: number;
}
export function spectrumBands(
  decibels: Float32Array,
  sampleRate: number,
  fftSize: number,
): MusicBands {
  const sums = { bass: 0, body: 0, air: 0 };
  for (let i = 1; i < decibels.length; i++) {
    const hz = (i * sampleRate) / fftSize,
      db = decibels[i];
    if (!Number.isFinite(db) || db > 0 || hz < 35 || hz > 12000) continue;
    const band = hz < 250 ? 'bass' : hz < 2500 ? 'body' : 'air';
    sums[band] += 10 ** (db / 10);
  }
  return {
    bass: Math.min(1, Math.sqrt(sums.bass) * 3),
    body: Math.min(1, Math.sqrt(sums.body) * 3),
    air: Math.min(1, Math.sqrt(sums.air) * 3),
  };
}
