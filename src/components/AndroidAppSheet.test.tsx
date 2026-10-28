import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AndroidAppSheet } from './AndroidAppSheet';
import { ANDROID_APP_URL } from '../ui/androidApp';

afterEach(cleanup);

describe('the Android offer', () => {
  it('offers the app and the web, and closes with a real answer', async () => {
    const onDismiss = vi.fn();
    const onKeepWeb = vi.fn();
    render(<AndroidAppSheet onDismiss={onDismiss} onKeepWeb={onKeepWeb} />);

    expect(screen.getByRole('dialog', { name: /wave for android/i })).toBeInTheDocument();
    const download = screen.getByRole('link', { name: /download the app/i });
    expect(download).toHaveAttribute('href', ANDROID_APP_URL);
    // Opening the file leaves Wave: the tab it opens gets no handle on the app.
    expect(download).toHaveAttribute('rel', 'noreferrer');

    await userEvent.click(screen.getByRole('button', { name: /keep using the web/i }));
    expect(onKeepWeb).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('can be closed without choosing', async () => {
    const onDismiss = vi.fn();
    render(<AndroidAppSheet onDismiss={onDismiss} onKeepWeb={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
