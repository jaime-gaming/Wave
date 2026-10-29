import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListeningPage } from './ListeningPage';
import { listeningSummary, makePlay } from '../domain/listening';
import { makeTrack } from '../test/fixtures';

const track = makeTrack({ id: 'signal', title: 'Signal', artist: 'Wave Tests' });
const now = new Date(2026, 9, 29, 20, 0).getTime();
const plays = [
  makePlay('signal', new Date(2026, 9, 28, 21, 0).getTime(), 130, true),
  makePlay('signal', new Date(2026, 9, 27, 21, 0).getTime(), 200, true),
];
const summary = listeningSummary(plays, [track], now);

const props = {
  summary,
  loaded: true,
  playing: false,
  onPlay: vi.fn(),
  onFavorite: vi.fn(),
  onArtist: vi.fn(),
  onImport: vi.fn(),
  onClear: vi.fn(),
};

describe('the listening page', () => {
  it('shows counted numbers, not guesses', () => {
    render(<ListeningPage {...props} />);
    expect(screen.getByRole('heading', { name: 'Listening' })).toBeInTheDocument();
    // Two plays of the same three-minute song: 330 seconds, rounded to minutes.
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === 'P' &&
          node.textContent === '2 plays · 6 min in total · kept on this device',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Listened this week')).toBeInTheDocument();
    expect(screen.getAllByText('2 plays').length).toBeGreaterThan(0);
  });

  it('gives every bar in the fortnight a readable label', () => {
    const { container } = render(<ListeningPage {...props} />);
    expect(container.querySelectorAll('.listening-bars li')).toHaveLength(14);
    // Screen readers get the day and the minutes, not a bare rectangle.
    const labels = [...container.querySelectorAll('.listening-bars .sr-only')].map(
      (node) => node.textContent ?? '',
    );
    expect(labels).toHaveLength(14);
    expect(labels.some((label) => label.includes('2 min'))).toBe(true);
  });

  it('plays the most played song from the top of the list', async () => {
    render(<ListeningPage {...props} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Play Signal' })[0]);
    expect(props.onPlay).toHaveBeenCalledWith([track], 'signal');
  });

  it('asks once before forgetting the history', async () => {
    const onClear = vi.fn();
    render(<ListeningPage {...props} onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: /Clear history/ }));
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Clear history/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('explains the empty page instead of showing an empty chart', () => {
    render(<ListeningPage {...props} summary={listeningSummary([], [track], now)} />);
    expect(screen.getByText('Nothing listened to yet')).toBeInTheDocument();
    expect(screen.queryByText('Last two weeks')).not.toBeInTheDocument();
  });
});
