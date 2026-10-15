import { expect, it } from 'vitest';
import { blendHue } from './palette';
it('follows the short hue arc, including the zero crossing', () => {
  expect(blendHue(350, 10, 0.5)).toBe(0);
  expect(blendHue(10, 350, 0.5)).toBe(0);
  expect(blendHue(10, 220, 0.5)).toBe(295);
  expect(blendHue(10, 220, 2)).toBe(220);
  expect(blendHue(10, 220, -1)).toBe(10);
});
