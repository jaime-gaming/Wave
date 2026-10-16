import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LyricsEditor } from './LyricsEditor';
import { lookupLyrics } from '../services/lyrics';
import { parseLyrics } from '../domain/lyrics';
import { makeTrack } from '../test/fixtures';
vi.mock('../services/lyrics', () => ({ lookupLyrics: vi.fn() }));
it('searches an unplayed track explicitly, previews without overwriting a draft and saves only on request', async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(true),
    close = vi.fn();
  vi.mocked(lookupLyrics).mockResolvedValue({
    lookup: { status: 'found', key: 'x', checkedAt: 1 },
    lyrics: { ...parseLyrics('[00:00]Found verse', 0, 'lrclib'), providerId: 24 },
  });
  render(<LyricsEditor track={makeTrack()} onSave={save} onClose={close} />);
  await user.type(screen.getByRole('textbox', { name: 'Lyrics' }), 'My draft');
  expect(lookupLyrics).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Search online' }));
  await screen.findByRole('button', { name: 'Use found lyrics' });
  expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue('My draft');
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Use found lyrics' }));
  expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue('[00:00]Found verse');
  await user.click(screen.getByRole('button', { name: 'Save lyrics' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      'signal',
      expect.objectContaining({ source: 'lrclib', providerId: 24 }),
    ),
  );
});
it('retains manual text on failure, respects cooldowns and aborts on unmount', async () => {
  const user = userEvent.setup();
  let signal: AbortSignal | undefined;
  vi.mocked(lookupLyrics).mockImplementation(async (_track, s) => {
    signal = s;
    return new Promise(() => {});
  });
  const { unmount } = render(
    <LyricsEditor
      track={makeTrack({ lyrics: parseLyrics('Manual verse') })}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Search online' }));
  expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveValue('Manual verse');
  unmount();
  expect(signal?.aborted).toBe(true);
  render(
    <LyricsEditor
      track={makeTrack()}
      retryAt={Date.now() + 60000}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Search online' })).toBeDisabled();
});
