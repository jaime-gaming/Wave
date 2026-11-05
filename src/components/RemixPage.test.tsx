import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RemixPage } from './RemixPage';
import { listeningSummary, weeklyRecap, weeklyRecaps } from '../domain/listening';
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
const history = weeklyRecaps(plays, tracks, now);

const props = {
  summary,
  recap,
  history,
  loaded: true,
  playing: false,
  onPlay: vi.fn(),
  onArtist: vi.fn(),
  onAdd: vi.fn(),
  onSave: vi.fn().mockResolvedValue(true),
  onClear: vi.fn(),
  onManageHistory: vi.fn(),
};

describe('the Remix page', () => {
  it('leads with three highlights and opens listening details on request', async () => {
    render(<RemixPage {...props} />);
    expect(screen.getByRole('heading', { name: 'Remix' })).toBeInTheDocument();
    // 450 seconds this week, rounded the way the rest of the app rounds.
    // The figure climbs to its value rather than appearing at it.
    expect(await screen.findByText('8 min')).toBeInTheDocument();
    expect(screen.queryByText('3 plays · 2 songs · 1 artist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Top artist/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Top song/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Listening time/ }));
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
    expect(props.onSave).toHaveBeenCalledWith(recap.mix, recap);
    // The most played song leads the list, and its count is shown as a fact.
    expect(screen.getAllByText('2×').length).toBe(1);
  });

  it('opens the day, artist and song mini menus separately', async () => {
    render(<RemixPage {...props} />);
    await userEvent.click(screen.getByRole('button', { name: /Listening time/ }));
    const week = screen.getByRole('region', { name: 'Listening per day' });
    expect(within(week).getAllByRole('button')).toHaveLength(7);
    await userEvent.click(screen.getByRole('button', { name: /Top artist/ }));
    await screen.findByText('3 plays');
    await userEvent.click(screen.getByRole('button', { name: /1.*Wave Tests.*3 plays/ }));
    expect(props.onArtist).toHaveBeenCalledWith('Wave Tests');
    await userEvent.click(screen.getByRole('button', { name: /Top song/ }));
    const top = await screen.findByRole('button', { name: /1.*Signal.*Wave Tests.*2 plays/ });
    await userEvent.click(top);
    expect(props.onPlay).toHaveBeenCalledWith(expect.any(Array), 'signal');
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

  it('says how the week compares with the one before it', async () => {
    const before = makePlay('signal', new Date(2026, 9, 20, 21, 0).getTime(), 60, true);
    const withHistory = weeklyRecap([...plays, before], tracks, now);
    const { rerender } = render(<RemixPage {...props} recap={withHistory} />);
    await userEvent.click(screen.getByRole('button', { name: /Listening time/ }));
    expect(screen.getByText(/vs last week/)).toBeInTheDocument();
    rerender(<RemixPage {...props} recap={recap} />);
  });

  it('counts listening time the way a person says it', () => {
    expect(screen.queryByText('Listened this week')).not.toBeInTheDocument();
    render(<RemixPage {...props} />);
    expect(screen.getByText(/listened all time/)).toBeInTheDocument();
  });

  it('sends Manage history somewhere that exists', async () => {
    const user = userEvent.setup();
    render(<RemixPage {...props} onManageHistory={props.onManageHistory} />);
    // It used to be an anchor to #settings-storage, which no page ever had.
    expect(screen.queryByRole('link', { name: 'Manage history' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage history' }));
    expect(props.onManageHistory).toHaveBeenCalledOnce();
  });

  it('invites a first song instead of showing empty numbers', () => {
    const empty = listeningSummary([], tracks, now);
    render(<RemixPage {...props} summary={empty} recap={weeklyRecap([], tracks, now)} />);
    expect(screen.getByText('No week to look back on yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add music' })).toBeInTheDocument();
  });
});

describe('the weeks before', () => {
  const older = [
    ...plays,
    makePlay('later', now - 9 * 86_400_000, 240, true),
    makePlay('signal', now - 10 * 86_400_000, 240, true),
  ];

  it('lists the previous weeks with their own figures', () => {
    render(
      <RemixPage
        {...props}
        summary={listeningSummary(older, tracks, now)}
        recap={weeklyRecap(older, tracks, now)}
        history={weeklyRecaps(older, tracks, now)}
      />,
    );
    const section = screen.getByRole('region', { name: 'Weeks before this one' });
    expect(within(section).getByText('2 plays · Later still')).toBeInTheDocument();
    // Three weeks before this one, none of them invented.
    expect(within(section).getAllByRole('listitem')).toHaveLength(3);
  });

  it('plays the week it is asked for', async () => {
    const onPlay = vi.fn();
    render(
      <RemixPage
        {...props}
        onPlay={onPlay}
        summary={listeningSummary(older, tracks, now)}
        recap={weeklyRecap(older, tracks, now)}
        history={weeklyRecaps(older, tracks, now)}
      />,
    );
    const section = screen.getByRole('region', { name: 'Weeks before this one' });
    await userEvent.click(within(section).getAllByRole('button', { name: 'Play that week' })[0]);
    expect(onPlay).toHaveBeenCalled();
    const [queue] = onPlay.mock.calls[0];
    expect(queue.map((track: { id: string }) => track.id)).toContain('later');
  });

  it('says a quiet week was quiet instead of hiding it', () => {
    render(
      <RemixPage
        {...props}
        summary={listeningSummary(plays, tracks, now)}
        history={weeklyRecaps(plays, tracks, now)}
      />,
    );
    const section = screen.getByRole('region', { name: 'Weeks before this one' });
    expect(within(section).getAllByText('A quiet week').length).toBeGreaterThan(0);
  });
});

it('keeps details under their own card and displays saved artist and song images', async () => {
  const photo = 'data:image/png;base64,artist';
  const artwork = 'data:image/png;base64,song';
  const richRecap = {
    ...recap,
    topTracks: [
      { ...recap.topTracks[0], track: { ...signal, artwork } },
      ...recap.topTracks.slice(1),
    ],
  };
  const { container } = render(
    <RemixPage {...props} recap={richRecap} artistPhotos={new Map([['Wave Tests', photo]])} />,
  );
  expect(container.querySelector('.remix-highlight-artist img')).toHaveAttribute('src', photo);
  expect(container.querySelector('.remix-highlight-song img')).toHaveAttribute('src', artwork);
  await userEvent.click(screen.getByRole('button', { name: /Top song/ }));
  const button = screen.getByRole('button', { name: /Top song/ });
  expect(button.parentElement?.querySelector('#remix-song-panel')).toBeInTheDocument();
  expect(
    container
      .querySelector('.remix-highlight-time')
      ?.parentElement?.querySelector('#remix-song-panel'),
  ).toBeNull();
});

it('explores an earlier week with its full chart, artists and songs', async () => {
  const olderPlays = [...plays, makePlay('later', now - 10 * 86_400_000, 190, true)];
  const weeks = weeklyRecaps(olderPlays, tracks, now, 12);
  render(<RemixPage {...props} history={weeks} />);
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Explore a week' }),
    String(weeks[1].start),
  );
  await userEvent.click(screen.getByRole('button', { name: /Listening time/ }));
  expect(screen.getByText('1 play · 1 song · 1 artist')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Listening per day' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Top song/ }));
  expect(
    await screen.findByRole('button', { name: /1.*Later still.*Wave Tests.*1 play/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('option')).toHaveLength(12);
  expect(screen.getByRole('region', { name: 'Your Remix' })).not.toHaveTextContent('Signal');
});
