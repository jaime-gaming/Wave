import { expect, it } from 'vitest';
import { headingAtDock } from './scrollHeading';

it('selects the nearest passing heading even when responsive layout changes their order', () => {
  const headings = [
    { top: 40, text: 'Albums' },
    { top: -100, text: 'Collection' },
    { top: 90, text: 'Artists' },
    { top: 20, text: 'Recent' },
  ];
  expect(headingAtDock(headings, 58)).toBe('Albums');
  expect(headingAtDock(headings, 20)).toBe('Recent');
  expect(headingAtDock(headings, -120)).toBe('');
  expect(headingAtDock([{ top: Number.NaN, text: 'Invalid' }], 58)).toBe('');
});
