import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYS,
  countsAsPlay,
  dayKey,
  listeningSummary,
  listeningTime,
  makePlay,
  playThreshold,
  playsByDay,
  prunePlays,
  timeAgo,
  weekRange,
  weeklyRecap,
  REMIX_LENGTH,
  type PlayEvent,
} from './listening';
import { makeTrack } from '../test/fixtures';

const track = makeTrack();
const next = makeTrack({ id: 'next', title: 'Next song', artist: 'Someone else' });
/** Fixed local time so the day buckets do not depend on when the suite runs. */
const now = new Date(2026, 9, 29, 20, 0, 0).getTime();
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 29 - daysAgo, hour, 30, 0).getTime();

describe('when a play counts', () => {
  it('waits for half the song or thirty seconds, whichever comes first', () => {
    expect(playThreshold(240)).toBe(30);
    expect(playThreshold(40)).toBe(20);
    expect(playThreshold(3)).toBe(5);
    expect(countsAsPlay(29, 240)).toBe(false);
    expect(countsAsPlay(30, 240)).toBe(true);
    expect(countsAsPlay(18, 40)).toBe(false);
    expect(countsAsPlay(20, 40)).toBe(true);
  });

  it('ignores nonsense durations instead of throwing', () => {
    expect(countsAsPlay(20, Number.NaN)).toBe(false);
    expect(playThreshold(0)).toBe(30);
    expect(countsAsPlay(-4, 100)).toBe(false);
  });
});

describe('the history store', () => {
  it('keeps the newest plays and drops the rest', () => {
    const plays = Array.from({ length: MAX_PLAYS + 5 }, (_, index) =>
      makePlay('signal', index, 40, false),
    );
    const pruned = prunePlays(plays);
    expect(pruned).toHaveLength(MAX_PLAYS);
    expect(pruned.at(-1)?.at).toBe(MAX_PLAYS + 4);
  });

  it('does not let a malformed row in', () => {
    const broken = [
      { id: 'a', trackId: 'signal', at: 1, seconds: Number.NaN, completed: false },
      null,
    ] as unknown as PlayEvent[];
    expect(prunePlays([...broken, makePlay('signal', 2, 40, false)])).toHaveLength(1);
  });

  it('names a day by the local calendar, not by UTC', () => {
    expect(dayKey(new Date(2026, 9, 29, 23, 59).getTime())).toBe('2026-10-29');
    expect(dayKey(new Date(2026, 9, 30, 0, 1).getTime())).toBe('2026-10-30');
  });
});

describe('the listening summary', () => {
  const plays: PlayEvent[] = [
    makePlay('signal', at(20), 90, true),
    makePlay('signal', at(3), 90, true),
    makePlay('signal', at(1, 9), 45, false),
    makePlay('next', at(1, 21), 120, true),
  ];
  const summary = listeningSummary(plays, [track, next], now);

  it('adds up the seconds and keeps a window of days', () => {
    expect(summary.totalSeconds).toBe(345);
    expect(summary.totalPlays).toBe(4);
    // The 20-day-old play is outside the week but inside the month.
    expect(summary.weekSeconds).toBe(255);
    expect(summary.weekPlays).toBe(3);
    expect(summary.monthSeconds).toBe(345);
    expect(summary.days).toHaveLength(14);
    // Yesterday, the 28th: two plays, and today has nothing yet.
    expect(summary.days.at(-2)).toMatchObject({ key: '2026-10-28', seconds: 165, plays: 2 });
    expect(summary.days.at(-1)).toMatchObject({ key: '2026-10-29', seconds: 0 });
    // A day with nothing played is still a day, with a zero.
    expect(summary.days[0]).toMatchObject({ seconds: 0, plays: 0 });
  });

  it('ranks songs and artists by plays, then by time', () => {
    expect(summary.topTracks[0]).toMatchObject({ plays: 3, seconds: 225 });
    expect(summary.topTracks[0].track.id).toBe('signal');
    expect(summary.topTracks[1]).toMatchObject({ plays: 1, seconds: 120 });
    expect(summary.topArtists.map((artist) => artist.artist)).toEqual([
      'Wave Tests',
      'Someone else',
    ]);
    expect(summary.uniqueTracks).toBe(2);
    expect(summary.uniqueArtists).toBe(2);
  });

  it('puts the newest play first and lists each song once in "jump back in"', () => {
    expect(summary.recent[0]).toMatchObject({ trackId: 'next' });
    expect(summary.recent[1]).toMatchObject({ trackId: 'signal' });
    expect(summary.recentTracks.map((entry) => entry.id)).toEqual(['next', 'signal']);
    expect(summary.hours[21]).toBe(120);
    expect(summary.hours[9]).toBe(45);
  });

  it('keeps the seconds of a song that was deleted without listing it', () => {
    const orphaned = listeningSummary(plays, [next], now);
    expect(orphaned.totalSeconds).toBe(345);
    expect(orphaned.topTracks.map((entry) => entry.track.id)).toEqual(['next']);
    expect(orphaned.recent.every((entry) => entry.track.id === 'next')).toBe(true);
  });

  it('groups the recent plays by day, newest day first', () => {
    const groups = playsByDay(plays, [track, next]);
    expect(groups.map((group) => group.key)).toEqual(['2026-10-28', '2026-10-26', '2026-10-09']);
    expect(groups[0].plays).toHaveLength(2);
  });
});

describe('listening time in words', () => {
  it('says minutes, then hours, without inventing precision', () => {
    expect(listeningTime(20)).toBe('less than a minute');
    expect(listeningTime(90)).toBe('2 min');
    expect(listeningTime(3_600)).toBe('1 h');
    expect(listeningTime(5_400)).toBe('1 h 30 min');
  });
});

describe('recent times in words', () => {
  const base = new Date(2026, 9, 29, 12, 0, 0).getTime();
  it('says how long ago something was, without a timestamp', () => {
    expect(timeAgo(base - 5_000, base)).toBe('just now');
    expect(timeAgo(base - 90_000, base)).toBe('2 min ago');
    expect(timeAgo(base - 3 * 3_600_000, base)).toBe('3 h ago');
    expect(timeAgo(base - 26 * 3_600_000, base)).toBe('yesterday');
    expect(timeAgo(base - 3 * 86_400_000, base)).toBe('3 days ago');
    expect(timeAgo(base - 14 * 86_400_000, base)).toBe('2 weeks ago');
    expect(timeAgo(base - 120 * 86_400_000, base)).toMatch(/\d/);
  });
});

describe('the weekly recap', () => {
  const plays = [
    makePlay('signal', at(1, 9), 200, true),
    makePlay('signal', at(2, 9), 200, true),
    makePlay('next', at(0, 9), 120, true),
    makePlay('next', at(9, 9), 300, true),
  ];
  const recap = weeklyRecap(plays, [track, next], now);

  it('counts only the last seven days, and compares with the seven before', () => {
    expect(recap.seconds).toBe(520);
    expect(recap.plays).toBe(3);
    expect(recap.tracks).toBe(2);
    expect(recap.artists).toBe(2);
    // The nine-day-old play falls in the seven days before this one, so it is
    // the comparison, not the week.
    expect(recap.previousSeconds).toBe(300);
  });

  it('builds Your Remix from the week, most played first, then tops it up', () => {
    expect(recap.topTracks[0].track.id).toBe('signal');
    expect(recap.mix[0].id).toBe('signal');
    expect(recap.mix).toHaveLength(2);
    expect(recap.mix.length).toBeLessThanOrEqual(REMIX_LENGTH);
  });

  it('pads a thin week from the all-time list without repeating a song', () => {
    const library = Array.from({ length: 6 }, (_, index) =>
      makeTrack({ id: `t${index}`, title: `Song ${index}` }),
    );
    const mixed = weeklyRecap(
      [
        makePlay('t0', at(0, 9), 120, true),
        makePlay('t1', at(20, 9), 120, true),
        makePlay('t2', at(21, 9), 120, true),
        makePlay('t3', at(22, 9), 120, true),
      ],
      library,
      now,
    );
    expect(mixed.mix[0].id).toBe('t0');
    expect(new Set(mixed.mix.map((song) => song.id)).size).toBe(mixed.mix.length);
    expect(mixed.mix.length).toBe(4);
  });

  it('draws the week as seven days, gaps and all', () => {
    expect(recap.days).toHaveLength(7);
    // Every day of the window is present, so the chart never changes width,
    // and the seconds in the bars add up to the week's total.
    expect(recap.days.reduce((total, day) => total + day.seconds, 0)).toBe(recap.seconds);
    expect(recap.days.reduce((total, day) => total + day.plays, 0)).toBe(recap.plays);
    expect(recap.days[6].seconds).toBeGreaterThan(0);
  });

  it('says when in the day, in the local clock', () => {
    expect(recap.hours).toHaveLength(24);
    expect(recap.hours[9]).toBeGreaterThan(0);
    expect(recap.hours.reduce((total, plays) => total + plays, 0)).toBe(recap.plays);
  });

  it('splits the week by the tags on the files, ignoring untagged songs', () => {
    const tagged = [
      makeTrack({ id: 'a', genres: ['Ambient', 'Electronic'] }),
      makeTrack({ id: 'b', genres: ['Ambient'] }),
      makeTrack({ id: 'c' }),
    ];
    const week = weeklyRecap(
      [
        makePlay('a', at(1, 9), 100, true),
        makePlay('b', at(2, 9), 60, true),
        makePlay('c', at(3, 9), 200, true),
      ],
      tagged,
      now,
    );
    expect(week.genres[0].genre).toBe('Ambient');
    expect(week.genres[0].seconds).toBe(160);
    expect(week.genres.find((slot) => slot.genre === 'Electronic')?.seconds).toBe(100);
    // The untagged song is still counted in the week, just not in a slice.
    expect(week.genres.reduce((total, slot) => total + slot.seconds, 0)).toBe(260);
    expect(week.seconds).toBe(360);
  });

  it('names the window in one line', () => {
    expect(weekRange(recap.start, recap.end)).toBe('23 – 29 Oct');
  });
});
