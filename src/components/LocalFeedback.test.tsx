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
  expect(feedbackEligible({ ...record, uses: 5 }, now, 0.01)).toBe(false);
  expect(feedbackEligible({ ...record, firstSeen: now }, now, 0.01)).toBe(false);
  expect(feedbackEligible({ ...record, disabled: true }, now, 0.01)).toBe(false);
  expect(feedbackEligible({ ...record, nextAt: now + DAY }, now, 0.01)).toBe(false);
});
it('shows nothing on first use', () => {
  render(<LocalFeedback />);
  act(() => window.dispatchEvent(new CustomEvent('wave:feature-used', { detail: 'Remix' })));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('offers a compact GitHub draft without pretending an opinion was submitted', () => {
  const now = Date.now();
  localStorage.setItem(
    FEEDBACK_KEY,
    JSON.stringify({ firstSeen: now - 8 * DAY, nextAt: 0, uses: 12, ratings: [] }),
  );
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<LocalFeedback page="Library" />);
  expect(screen.getByText('What do you think of Library?')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Share positive feedback on GitHub' });
  const draft = new URL(link.getAttribute('href')!);
  expect(draft.hostname).toBe('github.com');
  expect(draft.searchParams.get('title')).toBe('Feedback: Library');
  expect(draft.searchParams.get('body')).toContain('I like it');
  fireEvent.click(link);
  const record = JSON.parse(localStorage.getItem(FEEDBACK_KEY)!);
  expect(record.ratings).toEqual([]);
  expect(record.nextAt).toBeGreaterThanOrEqual(now + 21 * DAY);
  expect(fetch).not.toHaveBeenCalled();
});

it('places the prompt inside the open player dialog', async () => {
  const now = Date.now();
  localStorage.setItem(
    FEEDBACK_KEY,
    JSON.stringify({ firstSeen: now - 8 * DAY, nextAt: 0, uses: 12, ratings: [] }),
  );
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.appendChild(dialog);
  const view = render(<LocalFeedback page="Now playing" />);
  expect(dialog.querySelector('.local-feedback')).not.toBeNull();
  view.unmount();
  dialog.remove();
});
