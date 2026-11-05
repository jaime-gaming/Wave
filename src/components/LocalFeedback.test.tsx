import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalFeedback } from './LocalFeedback';
import { FEEDBACK_KEY, feedbackEligible } from '../ui/localFeedback';
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
const DAY = 86_400_000;
it('requires age, sustained use, cooldown and a rare chance', () => {
  const now = Date.now();
  const record = { firstSeen: now - 8 * DAY, nextAt: now - 1, uses: 12, ratings: [] };
  expect(feedbackEligible(record, now, 0.01)).toBe(true);
  expect(feedbackEligible(record, now, 0.5)).toBe(false);
  expect(feedbackEligible({ ...record, uses: 11 }, now, 0.01)).toBe(false);
  expect(feedbackEligible({ ...record, firstSeen: now }, now, 0.01)).toBe(false);
  expect(feedbackEligible({ ...record, disabled: true }, now, 0.01)).toBe(false);
  expect(feedbackEligible({ ...record, nextAt: now + DAY }, now, 0.01)).toBe(false);
});
it('shows nothing on first use', () => {
  render(<LocalFeedback />);
  act(() => window.dispatchEvent(new CustomEvent('wave:feature-used', { detail: 'Remix' })));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('keeps opinions on the device, with a thirty-day cooldown and no network', () => {
  const now = Date.now();
  localStorage.setItem(
    FEEDBACK_KEY,
    JSON.stringify({ firstSeen: now - 8 * DAY, nextAt: 0, uses: 12, ratings: [] }),
  );
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<LocalFeedback />);
  act(() => window.dispatchEvent(new CustomEvent('wave:feature-used', { detail: 'Remix' })));
  expect(screen.getByRole('dialog')).toHaveTextContent('not sent');
  fireEvent.click(screen.getByRole('button', { name: 'Works well' }));
  const record = JSON.parse(localStorage.getItem(FEEDBACK_KEY)!);
  expect(record.ratings).toMatchObject([{ feature: 'Remix', helpful: true }]);
  expect(record.nextAt).toBeGreaterThanOrEqual(now + 30 * DAY);
  expect(fetch).not.toHaveBeenCalled();
});
