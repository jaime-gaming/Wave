/**
 * Listening history, kept locally.
 *
 * Wave has no account and no analytics, which means it cannot know what you
 * listen to unless it writes it down here. The point is small and honest: a
 * play counts once, seconds are counted as they pass, and everything derived
 * from that — most played songs, top artists, the shape of a fortnight — is
 * computed from this file rather than sent anywhere.
 *
 * A "play" is deliberately not "a song started". Skipping through twenty songs
 * in a minute should not make twenty plays, so a play counts once the song has
 * actually been listened to: half of it, or thirty seconds, whichever is
 * shorter, and never less than five seconds for a very short track.
 */
import type { Track } from './types';

export interface PlayEvent {
  /** Stable identity: one entry per play, not per track. */
  id: string;
  trackId: string;
  /** When the play started, epoch milliseconds. */
  at: number;
  /** Seconds actually listened, which is not always the song's length. */
  seconds: number;
  /** Reached the end of the recording rather than being skipped away. */
  completed: boolean;
}

/** Half the song or thirty seconds, whichever comes first; five seconds minimum. */
export const PLAY_THRESHOLD_SECONDS = 30;
/** How many plays are kept. Older ones are dropped, newest are kept. */
export const MAX_PLAYS = 2_000;

export function playThreshold(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return PLAY_THRESHOLD_SECONDS;
  return Math.max(5, Math.min(PLAY_THRESHOLD_SECONDS, duration * 0.5));
}

/** True once a song has been listened to enough to count as played. */
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

/** Keeps the newest plays, oldest first, and drops anything malformed. */
export function prunePlays(plays: PlayEvent[], limit = MAX_PLAYS): PlayEvent[] {
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
  return ordered.length > limit ? ordered.slice(ordered.length - limit) : ordered;
}

/** Local calendar day, because listening at 23:00 belongs to that evening. */
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
  /** Everything ever counted. */
  totalSeconds: number;
  totalPlays: number;
  weekSeconds: number;
  weekPlays: number;
  monthSeconds: number;
  /** One entry per day for the requested window, oldest first, gaps included. */
  days: DayTotal[];
  /** Plays per hour of the local day, 0–23. */
  hours: number[];
  topTracks: TrackTotal[];
  topArtists: ArtistTotal[];
  /** Most recent plays, newest first, with the song still in the library. */
  recent: (PlayEvent & { track: Track })[];
  /** Songs heard most recently, without repeats — the "jump back in" row. */
  recentTracks: Track[];
  uniqueTracks: number;
  uniqueArtists: number;
}

/**
 * Everything the listening page shows, from the plays and the library.
 *
 * Deleted songs keep their seconds in the totals — they were listened to — but
 * are left out of the lists, which is why the two can disagree.
 */
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

/** Plays grouped by local day, newest day first, for the history list. */
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

/** Minutes as words a person would say, for the summary tiles. */
export function listeningTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** "2 h ago", "yesterday", "3 days ago" — words, not a timestamp. */
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

/**
 * The week as one card, and the playlist it earns.
 *
 * A recap is only worth showing when it is about a real week, so the window is
 * the last seven local days (today included) and the comparison is the seven
 * days before that. "Your Remix" is the week's most played songs in the order
 * they were played most, topped up from the all-time list when a week has fewer
 * than eight, with no repeats: an ordinary list of songs you can play, save as a
 * playlist and keep, not a recommendation.
 */
export interface WeekRecap {
  /** First day of the window, local midnight. */
  start: number;
  /** Midnight today, the last day of the window. */
  end: number;
  seconds: number;
  plays: number;
  tracks: number;
  artists: number;
  /** The seven days before this one, for the comparison line. */
  previousSeconds: number;
  /** One entry per day of the window, oldest first, quiet days included. */
  days: DayTotal[];
  /** Plays per hour of the local day for the week, 0–23. */
  hours: number[];
  /** The week's listening split by the genre tag on the files. */
  genres: { genre: string; seconds: number; plays: number }[];
  topTracks: TrackTotal[];
  topArtists: ArtistTotal[];
  mix: Track[];
}

/** How many songs "Your Remix" holds. */
export const REMIX_LENGTH = 12;

export function weeklyRecap(plays: PlayEvent[], tracks: Track[], now: number): WeekRecap {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const end = startOfDay(now);
  const start = end - 6 * DAY_MS;
  const previousStart = start - 7 * DAY_MS;
  const inWeek = plays.filter((play) => play.at >= start);
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

  // The shape of the week: a bar per day, a point per hour, a slice per genre.
  // All three are the same plays counted three ways, so they always agree with
  // the headline number.
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
    // One play can carry several tags; each of them gets the whole listen, so
    // the slices add up to the week rather than to a fraction of it.
    for (const raw of track.genres ?? []) {
      const genre = raw?.trim();
      if (!genre) continue;
      const entry = genres.get(genre) ?? { genre, seconds: 0, plays: 0 };
      entry.seconds += play.seconds;
      entry.plays++;
      genres.set(genre, entry);
    }
  }

  // The week first, then whatever is still worth hearing from before it, until
  // the list is long enough to be a playlist rather than a footnote.
  const mix: Track[] = ranked.map((entry) => entry.track);
  if (mix.length < REMIX_LENGTH) {
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

/** "26 Oct – 1 Nov", the window a recap covers. */
export function weekRange(start: number, end: number): string {
  const first = new Date(start);
  const last = new Date(end);
  const day = (date: Date) => date.getDate();
  const month = (date: Date) => date.toLocaleDateString(undefined, { month: 'short' });
  if (first.getMonth() === last.getMonth()) return `${day(first)} – ${day(last)} ${month(last)}`;
  return `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`;
}
