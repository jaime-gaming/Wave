import { expect, it } from 'vitest';
import { spectrumBands } from './musicSpectrum';
it.each([
  [100, 'bass'],
  [1000, 'body'],
  [6000, 'air'],
] as const)('classifies %i Hz without claiming instrument identity', (hz, band) => {
  const bins = new Float32Array(1024).fill(-Infinity);
  bins[Math.round((hz * 2048) / 24000)] = -12;
  const result = spectrumBands(bins, 24000, 2048);
  expect(result[band]).toBeGreaterThan(0.7);
  for (const other of ['bass', 'body', 'air'] as const)
    if (other !== band) expect(result[other]).toBe(0);
});
it('ignores invalid values, subsonic and out-of-range bins', () => {
  const bins = new Float32Array(1024).fill(-Infinity);
  bins[0] = 0;
  bins[1] = NaN;
  bins[2] = 1;
  expect(spectrumBands(bins, 48000, 2048)).toEqual({ bass: 0, body: 0, air: 0 });
});
