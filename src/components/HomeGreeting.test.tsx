import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HomeGreeting } from './HomeGreeting';

afterEach(() => vi.useRealTimers());
it('welcomes the listener, then gives the same heading space back to Home', () => {
  vi.useFakeTimers();
  const view = render(
    <h1>
      <HomeGreeting home="Home" greeting="Hello, Jaime" />
    </h1>,
  );
  expect(screen.getByRole('heading')).toHaveTextContent('Hello, Jaime');
  act(() => vi.advanceTimersByTime(3999));
  expect(screen.getByRole('heading')).toHaveTextContent('Hello, Jaime');
  act(() => vi.advanceTimersByTime(181));
  expect(screen.getByRole('heading')).toHaveTextContent('Home');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not count the welcome time while the loading screen is covering it', () => {
  vi.useFakeTimers();
  const view = render(<HomeGreeting active={false} home="Home" greeting="Hello, Jaime" />);
  act(() => vi.advanceTimersByTime(9000));
  expect(screen.getByText('Hello, Jaime')).toBeInTheDocument();
  view.rerender(<HomeGreeting active home="Home" greeting="Hello, Jaime" />);
  act(() => vi.advanceTimersByTime(4180));
  expect(screen.getByText('Home')).toBeInTheDocument();
});
