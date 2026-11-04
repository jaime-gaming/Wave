import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OFFLINE_TEXT, networkAriaLabel, networkLabel, useOnline } from '../ui/network';

function Probe() {
  return <span data-testid="state">{useOnline() ? 'online' : 'offline'}</span>;
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

describe('connectivity', () => {
  it('labels a control with text instead of its own name when offline', () => {
    expect(networkLabel(true, 'Search again')).toBe('Search again');
    expect(networkLabel(false, 'Search again')).toBe(OFFLINE_TEXT);
    expect(OFFLINE_TEXT).toBe('Offline');
    expect(networkAriaLabel(true, 'Search again')).toBeUndefined();
    expect(networkAriaLabel(false, 'Search again')).toBe('Search again: offline');
  });

  it('follows the browser online and offline events', () => {
    setOnline(true);
    render(<Probe />);
    expect(screen.getByTestId('state')).toHaveTextContent('online');
    setOnline(false);
    expect(screen.getByTestId('state')).toHaveTextContent('offline');
    setOnline(true);
    expect(screen.getByTestId('state')).toHaveTextContent('online');
  });

  it('keeps a text control visible but disabled, never hidden', async () => {
    setOnline(false);
    const onClick = vi.fn();
    render(
      <button
        type="button"
        disabled={!navigator.onLine}
        aria-label={networkAriaLabel(navigator.onLine, 'Search again')}
        onClick={onClick}
      >
        {networkLabel(navigator.onLine, 'Search again')}
      </button>,
    );
    const button = screen.getByRole('button', { name: 'Search again: offline' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Offline');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    setOnline(true);
  });
});
