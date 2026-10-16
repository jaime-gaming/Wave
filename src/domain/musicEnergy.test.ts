import { expect, it } from 'vitest';
import { amplitudeEnvelope, energyAt } from './musicEnergy';
it('measures actual channel amplitude and retains silent sections', () => {
  const samples = Float32Array.from({ length: 300 }, (_, i) => (i < 100 ? 0 : i < 200 ? 0.1 : 0.2));
  const envelope = amplitudeEnvelope([samples], 1000);
  expect(Array.from(envelope.values)).toEqual([0, expect.closeTo(0.4), expect.closeTo(0.8)]);
  expect(energyAt(envelope, 0.1)).toBeCloseTo(0.4);
  expect(energyAt(envelope, 0.15)).toBeCloseTo(0.6);
  expect(energyAt(envelope, 1)).toBe(0);
  expect(energyAt(undefined, 1)).toBe(0);
  expect(energyAt(envelope, NaN)).toBe(0);
  expect(energyAt(envelope, -1)).toBe(0);
});
it('combines channels without cancellation and bounds visual energy', () => {
  const loud = Float32Array.from({ length: 100 }, () => 1);
  expect(energyAt(amplitudeEnvelope([loud, loud.map((x) => -x)], 1000), 0)).toBe(1);
  expect(amplitudeEnvelope([], 1000).values).toHaveLength(0);
});
it('does not alias periodic program audio into silence during cue analysis', () => {
  const samples = Float32Array.from(
    { length: 8000 },
    (_, i) => Math.sin((i / 8000) * 1000 * 2 * Math.PI) * 0.1,
  );
  expect(amplitudeEnvelope([samples], 8000).values[0]).toBeGreaterThan(0.2);
});
