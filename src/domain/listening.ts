import type { Track } from './types';

export interface PlayEvent {
  id: string;
  trackId: string;

  at: number;

  seconds: number;

  completed: boolean;
}

export const PLAY_THRESHOLD_SECONDS = 30;

export const MAX_PLAYS = 10_000;

export const HISTORY_DAYS = 35;

export const HISTORY_PLAYS = 12_000;

export function playThreshold(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return PLAY_THRESHOLD_SECONDS;
  return Math.max(5, Math.min(PLAY_THRESHOLD_SECONDS, duration * 0.5));
}

export function countsAsPlay(seconds: number, duration: number): boolean {
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return seconds >= playThreshold(duration);
}

export function makePlay(
  trackId: string,
  startedAt: number,
  seconds: number,
  completed: boolean,
): PlayEvent {
  return {
    id: `${trackId}:${startedAt}`,
    trackId,
    at: startedAt,
    seconds: Math.max(0, Math.round(seconds)),
    completed,
  };
}

export function prunePlays(plays: PlayEvent[], limit = MAX_PLAYS, now = Date.now()): PlayEvent[] {
  const valid = plays.filter(
    (play) =>
      play &&
      typeof play.id === 'string' &&
      typeof play.trackId === 'string' &&
      Number.isFinite(play.at) &&
      Number.isFinite(play.seconds) &&
      play.seconds >= 0,
  );
  const ordered = [...valid].sort((a, b) => a.at - b.at);

  const keepFrom = now - HISTORY_DAYS * DAY_MS;
  const recent = ordered.filter((play) => play.at >= keepFrom).slice(-HISTORY_PLAYS);
  const older = ordered.filter((play) => play.at < keepFrom);
  const room = Math.max(0, limit - recent.length);
  return [...(room > 0 ? older.slice(-room) : []), ...recent];
}

export function dayKey(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const startOfDay = (at: number) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayTotal {
  key: string;
  at: number;
  seconds: number;
  plays: number;
}

export interface TrackTotal {
  track: Track;
  plays: number;
  seconds: number;
  lastPlayed: number;
}

export interface ArtistTotal {
  artist: string;
  plays: number;
  seconds: number;
  artwork?: string;
}

export interface ListeningSummary {
  totalSeconds: number;
  totalPlays: number;
  weekSeconds: number;
  weekPlays: number;
  monthSeconds: number;

  days: DayTotal[];

  hours: number[];
  topTracks: TrackTotal[];
  topArtists: ArtistTotal[];

  recent: (PlayEvent & { track: Track })[];

  recentTracks: Track[];
  uniqueTracks: number;
  uniqueArtists: number;
}

export function listeningSummary(
  plays: PlayEvent[],
  tracks: Track[],
  now: number,
  windowDays = 14,
): ListeningSummary {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const ordered = [...plays].sort((a, b) => a.at - b.at);
  const weekStart = startOfDay(now) - 6 * DAY_MS;
  const monthStart = startOfDay(now) - 29 * DAY_MS;

  let totalSeconds = 0;
  let weekSeconds = 0;
  let weekPlays = 0;
  let monthSeconds = 0;
  const hours = Array.from({ length: 24 }, () => 0);
  const trackTotals = new Map<string, TrackTotal>();
  const artistTotals = new Map<string, ArtistTotal>();
  const perDay = new Map<string, DayTotal>();

  for (const play of ordered) {
    const track = byId.get(play.trackId);
    totalSeconds += play.seconds;
    if (play.at >= weekStart) {
      weekSeconds += play.seconds;
      weekPlays++;
    }
    if (play.at >= monthStart) monthSeconds += play.seconds;
    const hour = new Date(play.at).getHours();
    if (hour >= 0 && hour < 24) hours[hour] += play.seconds;

    const day = dayKey(play.at);
    const existing = perDay.get(day);
    if (existing) {
      existing.seconds += play.seconds;
      existing.plays++;
    } else {
      perDay.set(day, { key: day, at: startOfDay(play.at), seconds: play.seconds, plays: 1 });
    }

    if (!track) continue;
    const current = trackTotals.get(track.id);
    if (current) {
      current.plays++;
      current.seconds += play.seconds;
      current.lastPlayed = Math.max(current.lastPlayed, play.at);
    } else {
      trackTotals.set(track.id, {
        track,
        plays: 1,
        seconds: play.seconds,
        lastPlayed: play.at,
      });
    }
    const artistName = track.artist || 'Unknown artist';
    const artist = artistTotals.get(artistName);
    if (artist) {
      artist.plays++;
      artist.seconds += play.seconds;
      if (!artist.artwork && track.artwork) artist.artwork = track.artwork;
    } else {
      artistTotals.set(artistName, {
        artist: artistName,
        plays: 1,
        seconds: play.seconds,
        artwork: track.artwork,
      });
    }
  }

  const days: DayTotal[] = [];
  for (let index = windowDays - 1; index >= 0; index--) {
    const at = startOfDay(now) - index * DAY_MS;
    const key = dayKey(at);
    days.push(perDay.get(key) ?? { key, at, seconds: 0, plays: 0 });
  }

  const recent: (PlayEvent & { track: Track })[] = [];
  const recentTracks: Track[] = [];
  const seen = new Set<string>();
  for (let index = ordered.length - 1; index >= 0; index--) {
    const play = ordered[index];
    const track = byId.get(play.trackId);
    if (!track) continue;
    if (recent.length < 20) recent.push({ ...play, track });
    if (!seen.has(track.id) && recentTracks.length < 12) {
      seen.add(track.id);
      recentTracks.push(track);
    }
    if (recent.length >= 20 && recentTracks.length >= 12) break;
  }

  const ranked = [...trackTotals.values()].sort(
    (a, b) => b.plays - a.plays || b.seconds - a.seconds || b.lastPlayed - a.lastPlayed,
  );

  return {
    totalSeconds,
    totalPlays: ordered.length,
    weekSeconds,
    weekPlays,
    monthSeconds,
    days,
    hours,
    topTracks: ranked.slice(0, 8),
    topArtists: [...artistTotals.values()]
      .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
      .slice(0, 6),
    recent,
    recentTracks,
    uniqueTracks: trackTotals.size,
    uniqueArtists: artistTotals.size,
  };
}

export function playsByDay(
  plays: PlayEvent[],
  tracks: Track[],
  limit = 60,
): { key: string; at: number; plays: (PlayEvent & { track: Track })[] }[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const groups = new Map<
    string,
    { key: string; at: number; plays: (PlayEvent & { track: Track })[] }
  >();
  const ordered = [...plays].sort((a, b) => b.at - a.at).slice(0, limit);
  for (const play of ordered) {
    const track = byId.get(play.trackId);
    if (!track) continue;
    const key = dayKey(play.at);
    const group = groups.get(key);
    const entry = { ...play, track };
    if (group) group.plays.push(entry);
    else groups.set(key, { key, at: startOfDay(play.at), plays: [entry] });
  }
  return [...groups.values()];
}

export function listeningTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface WeekRecap {
  start: number;

  end: number;
  seconds: number;
  plays: number;
  tracks: number;
  artists: number;

  previousSeconds: number;

  days: DayTotal[];

  hours: number[];

  genres: { genre: string; seconds: number; plays: number }[];
  topTracks: TrackTotal[];
  topArtists: ArtistTotal[];
  mix: Track[];
}

export const REMIX_LENGTH = 12;

export function weeklyRecap(
  plays: PlayEvent[],
  tracks: Track[],
  now: number,
  weeksAgo = 0,
): WeekRecap {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const end = startOfDay(now) - Math.max(0, weeksAgo) * 7 * DAY_MS;
  const start = end - 6 * DAY_MS;
  const previousStart = start - 7 * DAY_MS;

  const inWeek = plays.filter((play) => play.at >= start && play.at < end + DAY_MS);
  const previous = plays.filter((play) => play.at >= previousStart && play.at < start);

  const trackTotals = new Map<string, TrackTotal>();
  const artistTotals = new Map<string, ArtistTotal>();
  const heard = new Set<string>();
  for (const play of inWeek) {
    const track = byId.get(play.trackId);
    if (!track) continue;
    heard.add(track.id);
    const current = trackTotals.get(track.id);
    if (current) {
      current.plays++;
      current.seconds += play.seconds;
      current.lastPlayed = Math.max(current.lastPlayed, play.at);
    } else {
      trackTotals.set(track.id, {
        track,
        plays: 1,
        seconds: play.seconds,
        lastPlayed: play.at,
      });
    }
    const name = track.artist || 'Unknown artist';
    const artist = artistTotals.get(name);
    if (artist) {
      artist.plays++;
      artist.seconds += play.seconds;
      if (!artist.artwork && track.artwork) artist.artwork = track.artwork;
    } else {
      artistTotals.set(name, {
        artist: name,
        plays: 1,
        seconds: play.seconds,
        artwork: track.artwork,
      });
    }
  }

  const ranked = [...trackTotals.values()].sort(
    (a, b) => b.plays - a.plays || b.seconds - a.seconds || b.lastPlayed - a.lastPlayed,
  );

  const days: DayTotal[] = Array.from({ length: 7 }, (_, index) => {
    const at = start + index * DAY_MS;
    return { key: dayKey(at), at, seconds: 0, plays: 0 };
  });
  const hours = Array.from({ length: 24 }, () => 0);
  const genres = new Map<string, { genre: string; seconds: number; plays: number }>();
  for (const play of inWeek) {
    const index = Math.min(6, Math.max(0, Math.round((startOfDay(play.at) - start) / DAY_MS)));
    days[index].seconds += play.seconds;
    days[index].plays++;
    hours[new Date(play.at).getHours()]++;
    const track = byId.get(play.trackId);
    if (!track) continue;

    for (const raw of track.genres ?? []) {
      const genre = raw?.trim();
      if (!genre) continue;
      const entry = genres.get(genre) ?? { genre, seconds: 0, plays: 0 };
      entry.seconds += play.seconds;
      entry.plays++;
      genres.set(genre, entry);
    }
  }

  const mix: Track[] = ranked.map((entry) => entry.track);
  if (mix.length < REMIX_LENGTH && weeksAgo === 0) {
    const seen = new Set(mix.map((track) => track.id));
    const allTime = listeningSummary(plays, tracks, now).topTracks;
    for (const entry of allTime) {
      if (mix.length >= REMIX_LENGTH) break;
      if (seen.has(entry.track.id)) continue;
      seen.add(entry.track.id);
      mix.push(entry.track);
    }
  }

  return {
    start,
    end,
    seconds: inWeek.reduce((total, play) => total + play.seconds, 0),
    plays: inWeek.length,
    tracks: heard.size,
    artists: artistTotals.size,
    previousSeconds: previous.reduce((total, play) => total + play.seconds, 0),
    days,
    hours,
    genres: [...genres.values()].sort((a, b) => b.seconds - a.seconds),
    topTracks: ranked.slice(0, 8),
    topArtists: [...artistTotals.values()]
      .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
      .slice(0, 3),
    mix: mix.slice(0, REMIX_LENGTH),
  };
}

export function weeklyRecaps(
  plays: PlayEvent[],
  tracks: Track[],
  now: number,
  weeks = 4,
): WeekRecap[] {
  const total = Math.max(1, Math.min(52, Math.round(weeks)));
  return Array.from({ length: total }, (_, index) => weeklyRecap(plays, tracks, now, index));
}

export function weekRange(start: number, end: number): string {
  const first = new Date(start);
  const last = new Date(end);
  const day = (date: Date) => date.getDate();
  const month = (date: Date) => date.toLocaleDateString(undefined, { month: 'short' });
  if (first.getMonth() === last.getMonth()) return `${day(first)} – ${day(last)} ${month(last)}`;
  return `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`;
}

export type RecapPeriod = 'week' | 'month' | 'year';

export interface RecapBucket {
  key: string;
  label: string;
  shortLabel: string;
  seconds: number;
  plays: number;
}

export interface PeriodRecap {
  period: 'month' | 'year';

  key: string;

  label: string;
  start: number;
  end: number;
  seconds: number;
  plays: number;
  tracks: number;
  artists: number;
  previousSeconds: number;
  buckets: RecapBucket[];
  genres: { genre: string; seconds: number; plays: number }[];
  topTracks: TrackTotal[];
  topArtists: ArtistTotal[];
  mix: Track[];
}

function summarizeRange(
  plays: PlayEvent[],
  tracks: Track[],
  start: number,
  endExclusive: number,
  previousStart: number,
  mixLimit: number,
) {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const inRange = plays.filter((play) => play.at >= start && play.at < endExclusive);
  const previous = plays.filter((play) => play.at >= previousStart && play.at < start);
  const trackTotals = new Map<string, TrackTotal>();
  const artistTotals = new Map<string, ArtistTotal>();
  const genres = new Map<string, { genre: string; seconds: number; plays: number }>();
  const heard = new Set<string>();

  for (const play of inRange) {
    const track = byId.get(play.trackId);
    if (!track) continue;
    heard.add(track.id);
    const current = trackTotals.get(track.id);
    if (current) {
      current.plays++;
      current.seconds += play.seconds;
      current.lastPlayed = Math.max(current.lastPlayed, play.at);
    } else {
      trackTotals.set(track.id, {
        track,
        plays: 1,
        seconds: play.seconds,
        lastPlayed: play.at,
      });
    }
    const name = track.artist || 'Unknown artist';
    const artist = artistTotals.get(name);
    if (artist) {
      artist.plays++;
      artist.seconds += play.seconds;
      if (!artist.artwork && track.artwork) artist.artwork = track.artwork;
    } else {
      artistTotals.set(name, {
        artist: name,
        plays: 1,
        seconds: play.seconds,
        artwork: track.artwork,
      });
    }
    for (const raw of track.genres ?? []) {
      const genre = raw?.trim();
      if (!genre) continue;
      const entry = genres.get(genre) ?? { genre, seconds: 0, plays: 0 };
      entry.seconds += play.seconds;
      entry.plays++;
      genres.set(genre, entry);
    }
  }

  const ranked = [...trackTotals.values()].sort(
    (a, b) => b.plays - a.plays || b.seconds - a.seconds || b.lastPlayed - a.lastPlayed,
  );
  const rankedArtists = [...artistTotals.values()].sort(
    (a, b) => b.plays - a.plays || b.seconds - a.seconds,
  );

  return {
    inRange,
    seconds: inRange.reduce((total, play) => total + play.seconds, 0),
    plays: inRange.length,
    tracks: heard.size,
    artists: artistTotals.size,
    previousSeconds: previous.reduce((total, play) => total + play.seconds, 0),
    genres: [...genres.values()].sort((a, b) => b.seconds - a.seconds),
    topTracks: ranked.slice(0, 12),
    topArtists: rankedArtists.slice(0, 5),
    mix: ranked.map((entry) => entry.track).slice(0, mixLimit),
  };
}

export function monthlyRecap(
  plays: PlayEvent[],
  tracks: Track[],
  year: number,
  monthIndex: number,
): PeriodRecap {
  const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const nextMonth = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  const prevMonth = new Date(year, monthIndex - 1, 1, 0, 0, 0, 0);
  const start = startDate.getTime();
  const endExclusive = nextMonth.getTime();
  const end = endExclusive - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const stats = summarizeRange(plays, tracks, start, endExclusive, prevMonth.getTime(), 15);
  const bucketCount = Math.ceil(daysInMonth / 7);
  const buckets: RecapBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const firstDay = i * 7 + 1;
    const lastDay = Math.min(daysInMonth, firstDay + 6);
    return {
      key: `${year}-${monthIndex + 1}-w${i + 1}`,
      label: `${firstDay}-${lastDay}`,
      shortLabel: `W${i + 1}`,
      seconds: 0,
      plays: 0,
    };
  });
  for (const play of stats.inRange) {
    const day = new Date(play.at).getDate();
    const idx = Math.min(bucketCount - 1, Math.floor((day - 1) / 7));
    buckets[idx].seconds += play.seconds;
    buckets[idx].plays++;
  }

  const monthLabel = startDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return {
    period: 'month',
    key,
    label: monthLabel[0] ? monthLabel[0].toUpperCase() + monthLabel.slice(1) : monthLabel,
    start,
    end,
    seconds: stats.seconds,
    plays: stats.plays,
    tracks: stats.tracks,
    artists: stats.artists,
    previousSeconds: stats.previousSeconds,
    buckets,
    genres: stats.genres,
    topTracks: stats.topTracks,
    topArtists: stats.topArtists,
    mix: stats.mix,
  };
}

export function monthlyRecaps(
  plays: PlayEvent[],
  tracks: Track[],
  now: number,
  months = 12,
): PeriodRecap[] {
  const anchor = new Date(now);
  const seen = new Set<string>();
  const coords: { year: number; month: number }[] = [];
  for (let offset = 0; offset < Math.max(1, months); offset++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      coords.push({ year: d.getFullYear(), month: d.getMonth() });
    }
  }
  for (const play of plays) {
    const d = new Date(play.at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      coords.push({ year: d.getFullYear(), month: d.getMonth() });
    }
  }
  coords.sort((a, b) => b.year - a.year || b.month - a.month);
  return coords.map(({ year, month }) => monthlyRecap(plays, tracks, year, month));
}

export function yearlyRecap(plays: PlayEvent[], tracks: Track[], year: number): PeriodRecap {
  const start = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const endExclusive = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime();
  const prevStart = new Date(year - 1, 0, 1, 0, 0, 0, 0).getTime();
  const stats = summarizeRange(plays, tracks, start, endExclusive, prevStart, 20);

  const buckets: RecapBucket[] = Array.from({ length: 12 }, (_, monthIdx) => {
    const sample = new Date(year, monthIdx, 1);
    const longName = sample.toLocaleDateString(undefined, { month: 'long' });
    const shortName = sample.toLocaleDateString(undefined, { month: 'short' });
    return {
      key: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
      label: longName[0] ? longName[0].toUpperCase() + longName.slice(1) : longName,
      shortLabel: shortName.slice(0, 1).toUpperCase(),
      seconds: 0,
      plays: 0,
    };
  });
  for (const play of stats.inRange) {
    const monthIdx = new Date(play.at).getMonth();
    if (monthIdx >= 0 && monthIdx < 12) {
      buckets[monthIdx].seconds += play.seconds;
      buckets[monthIdx].plays++;
    }
  }

  return {
    period: 'year',
    key: String(year),
    label: String(year),
    start,
    end: endExclusive - 1,
    seconds: stats.seconds,
    plays: stats.plays,
    tracks: stats.tracks,
    artists: stats.artists,
    previousSeconds: stats.previousSeconds,
    buckets,
    genres: stats.genres,
    topTracks: stats.topTracks,
    topArtists: stats.topArtists,
    mix: stats.mix,
  };
}

export function yearlyRecaps(plays: PlayEvent[], tracks: Track[], now: number): PeriodRecap[] {
  const years = new Set<number>([new Date(now).getFullYear()]);
  for (const play of plays) {
    if (Number.isFinite(play.at)) years.add(new Date(play.at).getFullYear());
  }
  return [...years].sort((a, b) => b - a).map((year) => yearlyRecap(plays, tracks, year));
}
