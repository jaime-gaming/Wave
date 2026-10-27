import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LyricsPanel } from './LyricsPanel';
import { parseLyrics } from '../domain/lyrics';
import { makeTrack } from '../test/fixtures';
it('fills text in reading order without an elapsed bar, follows seeks and preserves text', () => {
  const previous = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  try {
    const track = makeTrack({ lyrics: parseLyrics('[00:00]First word\n[00:04]Next line') });
    const props = { track, time: 2, duration: 8, onSeek: vi.fn(), onEdit: vi.fn() };
    const { container, rerender } = render(<LyricsPanel {...props} />);
    const first = screen.getByRole('button', { name: 'Seek to lyric: First word' });
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(first.textContent).toBe('First word');
    expect(first.querySelector('.lyric-text')).toHaveAttribute('data-fill', '0.5');
    expect(first.querySelectorAll('.lyric-word')).toHaveLength(2);
    expect(first.querySelector('.lyric-word')?.getAttribute('style')).toContain('100%');
    expect(container.querySelector('.lyric-elapsed')).toBeNull();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    rerender(<LyricsPanel {...props} time={6} />);
    expect(
      screen.getByRole('button', { name: 'Seek to lyric: Next line' }).querySelector('.lyric-text'),
    ).toHaveAttribute('data-fill', '0.5');
    expect(first.querySelector('.lyric-text')).toHaveAttribute('data-fill', '1');
    rerender(<LyricsPanel {...props} time={0} />);
    expect(first.querySelector('.lyric-text')).toHaveAttribute('data-fill', '0');
  } finally {
    HTMLElement.prototype.scrollTo = previous;
  }
});

it('keeps timing controls tucked away and explains nothing about the timing', () => {
  const previous = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  try {
    const lyrics = {
      ...parseLyrics('[00:00]First line\n[00:04]Next line', 0, 'lrclib'),
      providerId: 42,
    };
    const onOffset = vi.fn().mockResolvedValue(true),
      onEdit = vi.fn();
    const { container } = render(
      <LyricsPanel
        stage
        track={makeTrack({ lyrics })}
        time={1}
        duration={90}
        onSeek={vi.fn()}
        onEdit={onEdit}
        onOffset={onOffset}
      />,
    );
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(container.querySelector('.lyrics-provenance')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/Word-timed|saved offline|interpolat/i)).toBeNull();
    // The one hint kept: the line is a seek target.
    expect(screen.getByText('Tap a line to seek')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Adjust lyric timing'));
    expect(details.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show lyrics 100 milliseconds later' }));
    expect(onOffset).toHaveBeenCalledWith({ ...lyrics, offsetMs: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit lyrics' }));
    expect(onEdit).toHaveBeenCalledOnce();
  } finally {
    HTMLElement.prototype.scrollTo = previous;
  }
});

it('recovers the timing controls after a failed save instead of leaving them disabled', async () => {
  const previous = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  try {
    const lyrics = parseLyrics('[00:00]First line\n[00:04]Next line');
    const onOffset = vi
      .fn()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce(true);
    render(
      <LyricsPanel
        stage
        track={makeTrack({ lyrics })}
        time={1}
        duration={90}
        onSeek={vi.fn()}
        onEdit={vi.fn()}
        onOffset={onOffset}
      />,
    );
    fireEvent.click(screen.getByLabelText('Adjust lyric timing'));
    const later = screen.getByRole('button', { name: 'Show lyrics 100 milliseconds later' });
    fireEvent.click(later);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save timing'),
    );
    expect(later).toBeEnabled();
    fireEvent.click(later);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(onOffset).toHaveBeenCalledTimes(2);
  } finally {
    HTMLElement.prototype.scrollTo = previous;
  }
});

it('highlights each word individually, with a line-level fallback', () => {
  const previous = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  try {
    const track = makeTrack({
      lyrics: parseLyrics('[00:00]We were young\n[00:04]Next line'),
    });
    const props = { track, duration: 8, onSeek: vi.fn(), onEdit: vi.fn(), karaoke: true };
    const { rerender } = render(<LyricsPanel {...props} time={0} />);
    const line = screen.getByRole('button', { name: 'Seek to lyric: We were young' });
    const words = [...line.querySelectorAll('.lyric-word')];
    expect(words).toHaveLength(3);
    // No provider timestamps: the word timing is derived and labelled as such.
    expect(words.every((word) => word.getAttribute('data-word-source') === 'derived')).toBe(true);
    expect(words[0]).toHaveAttribute('data-word-fill', '0');

    // Two seconds into a four-second line: the first word is complete, the rest
    // are mid-fill or not started, never all-or-nothing.
    rerender(<LyricsPanel {...props} time={2} />);
    const fills = [...line.querySelectorAll('.lyric-word')].map((word) =>
      Number(word.getAttribute('data-word-fill')),
    );
    expect(fills[0]).toBe(1);
    expect(fills[2]).toBeLessThan(1);
    expect(fills[1]).toBeGreaterThan(0);

    // Built in, not optional: without line timing the panel falls back to the
    // previous whole-line view instead of hiding the lyrics.
    rerender(
      <LyricsPanel
        {...props}
        track={makeTrack({ lyrics: parseLyrics('We were young') })}
        time={2}
      />,
    );
    expect(
      [...document.querySelectorAll('.lyric-word')].every(
        (word) => word.getAttribute('data-word-source') === null,
      ),
    ).toBe(true);
  } finally {
    HTMLElement.prototype.scrollTo = previous;
  }
});

it('frames exactly three lines in the stage reader, whatever the height', () => {
  const previous = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  try {
    const raw = Array.from(
      { length: 12 },
      (_, i) => `[00:${String(i * 4).padStart(2, '0')}]Line ${i + 1}`,
    );
    const track = makeTrack({ lyrics: parseLyrics(raw.join('\n')) });
    const { container, rerender } = render(
      <LyricsPanel stage track={track} time={24} duration={60} onSeek={vi.fn()} onEdit={vi.fn()} />,
    );
    const lines = () => container.querySelectorAll('.lyric-line');
    expect(lines()).toHaveLength(3);
    // The line being sung sits in the middle of the three.
    expect(lines()[1]).toHaveAttribute('aria-current', 'true');
    expect(lines()[1].textContent).toBe('Line 7');
    rerender(
      <LyricsPanel stage track={track} time={8} duration={60} onSeek={vi.fn()} onEdit={vi.fn()} />,
    );
    expect(lines()).toHaveLength(3);
    expect(container.querySelector('.lyrics-scroll--framed')).not.toBeNull();
  } finally {
    HTMLElement.prototype.scrollTo = previous;
  }
});
