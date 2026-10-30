import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RemixPage } from './RemixPage';
import { listeningSummary, weeklyRecap } from '../domain/listening';
import { makePlay } from '../domain/listening';
import { makeTrack } from '../test/fixtures';

const signal = makeTrack({ id: 'signal', title: 'Signal', artist: 'Wave Tests' });
const later = makeTrack({ id: 'later', title: 'Later still', artist: 'Wave Tests' });
const now = new Date(2026, 9, 29, 20, 0).getTime();
const plays = [
  makePlay('signal', new Date(2026, 9, 28, 21, 0).getTime(), 130, true),
  makePlay('signal', new Date(2026, 9, 27, 21, 0).getTime(), 200, true),
  makePlay('later', new Date(2026, 9, 29, 9, 0).getTime(), 120, true),
];
const tracks = [signal, later];
const summary = listeningSummary(plays, tracks, now);
const recap = weeklyRecap(plays, tracks, now);

const props = {
  summary,
  recap,
  loaded: true,
  playing: false,
  onPlay: vi.fn(),
  onArtist: vi.fn(),
  onAdd: vi.fn(),
  onSave: vi.fn().mockResolvedValue(true),
  onClear: vi.fn(),
};

describe('the Remix page', () => {
  it('leads with the week in one number, not a dashboard', async () => {
    render(<RemixPage {...props} />);
    expect(screen.getByRole('heading', { name: 'Remix' })).toBeInTheDocument();
    // 450 seconds this week, rounded the way the rest of the app rounds.
    // The figure climbs to its value rather than appearing at it.
    expect(await screen.findByText('8 min')).toBeInTheDocument();
    expect(screen.getByText('3 plays · 2 songs · 1 artist')).toBeInTheDocument();
    // The old page's detail sections are gone on purpose.
    expect(screen.queryByRole('region', { name: /last two weeks/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('offers the week as a playlist that can be played or saved', async () => {
    const user = userEvent.setup();
    render(<RemixPage {...props} />);
    expect(screen.getByRole('region', { name: 'Your Remix' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Play Remix/i }));
    expect(props.onPlay).toHaveBeenCalledWith(recap.mix, recap.mix[0].id);
    await user.click(screen.getByRole('button', { name: /Save as playlist/i }));
    expect(props.onSave).toHaveBeenCalledWith(recap.mix);
    // The most played song leads the list, and its count is shown as a fact.
    expect(screen.getAllByText('2×').length).toBe(1);
  });

  it('shows the week as seven days and the artists behind it', () => {
    render(<RemixPage {...props} />);
    const week = screen.getByRole('region', { name: 'Listening per day' });
    // One column per day, each named with its own total for screen readers.
    expect(within(week).getAllByRole('button')).toHaveLength(7);
    const artists = screen.getByRole('region', { name: 'Artists this week' });
    expect(within(artists).getByText('Wave Tests')).toBeInTheDocument();
    expect(within(artists).getByText('3 plays')).toBeInTheDocument();
    // The genre and the hour are a line of type now, not a section with charts.
    expect(screen.getByText(/Usually around|Mostly/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /0:00:/ })).not.toBeInTheDocument();
  });

  it('does not clear listening history without confirmation', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<RemixPage {...props} onClear={onClear} />);
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onClear).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    await user.click(screen.getByRole('button', { name: 'Yes, clear' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('says how the week compares with the one before it', () => {
    const before = makePlay('signal', new Date(2026, 9, 20, 21, 0).getTime(), 60, true);
    const withHistory = weeklyRecap([...plays, before], tracks, now);
    const { rerender } = render(<RemixPage {...props} recap={withHistory} />);
    expect(screen.getByText(/vs last week/)).toBeInTheDocument();
    rerender(<RemixPage {...props} recap={recap} />);
  });

  it('counts listening time the way a person says it', () => {
    expect(screen.queryByText('Listened this week')).not.toBeInTheDocument();
    render(<RemixPage {...props} />);
    expect(screen.getByText(/listened all time/)).toBeInTheDocument();
  });

  it('invites a first song instead of showing empty numbers', () => {
    const empty = listeningSummary([], tracks, now);
    render(<RemixPage {...props} summary={empty} recap={weeklyRecap([], tracks, now)} />);
    expect(screen.getByText('No week to look back on yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add music' })).toBeInTheDocument();
  });
});
