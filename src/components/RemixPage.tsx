import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AudioLines, Disc3, Play } from 'lucide-react';
import { Artwork } from './Artwork';
import { EmptyState } from './EmptyState';
import { useWaveMotion } from '../ui/motion';
import type { Track } from '../domain/types';
import {
  listeningTime,
  weekRange,
  type ListeningSummary,
  type WeekRecap,
} from '../domain/listening';

/**
 * A figure that walks to a new value instead of swapping.
 *
 * It starts at the value it was given — the page opens on the real number, not
 * on a zero it has to climb out of — and only travels when the week itself
 * changes, which is when a movement says something: more was played.
 */
function useCountUp(value: number, enabled: boolean) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!enabled || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / 620);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -9 * progress);
      setShown(Math.round(origin + (value - origin) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    });
    return () => cancelAnimationFrame(frame);
  }, [value, enabled]);
  return shown;
}

/** "62 min" that counts up, without inventing a shorter phrase mid-animation. */
function useTimeCountUp(seconds: number, enabled: boolean) {
  const shown = useCountUp(seconds, enabled);
  // Under a minute the phrase is "less than a minute", so the count only runs
  // when there is something to count.
  return seconds >= 60 ? listeningTime(shown) : listeningTime(seconds);
}

const weekday = (at: number) => new Date(at).toLocaleDateString(undefined, { weekday: 'short' });
const dayNumber = (at: number) => new Date(at).getDate();

/** A seven-day listening recap and a playable selection, made on this device. */
export function RemixPage({
  summary,
  recap,
  loaded,
  currentId,
  playing,
  onPlay,
  onArtist,
  onSave,
  onClear,
  onAdd,
  onManageHistory,
}: {
  summary: ListeningSummary;
  /** The week and its Remix list, built where the plays and the library both are. */
  recap: WeekRecap;
  loaded: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onArtist: (name: string) => void;
  onSave: (tracks: Track[]) => Promise<boolean> | boolean;
  onClear: () => Promise<void> | void;
  onAdd: () => void;
  /** Opens Settings on the section that shows what Wave keeps on this device. */
  onManageHistory: () => void;
}) {
  const animation = useWaveMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  const seconds = useTimeCountUp(recap.seconds, animation.enabled);

  if (loaded && !summary.totalPlays)
    return (
      <div className="remix-page">
        <h2 className="sr-only" tabIndex={-1} ref={heading}>
          Remix
        </h2>
        <EmptyState
          icon={<AudioLines size={40} strokeWidth={1.4} />}
          title="No week to look back on yet"
          description="Import your files or add a YouTube song, play something, and this page fills in: your week in one number, and a Remix list made from what you actually played."
          hint="Kept on this device, never uploaded"
          actions={
            <button className="tonal-button" onClick={onAdd}>
              Add music
            </button>
          }
        />
      </div>
    );

  const hero = recap.mix;
  const delta = recap.seconds - recap.previousSeconds;
  const peak = Math.max(1, ...recap.days.map((day) => day.seconds));
  const busiestDay = [...recap.days].sort((a, b) => b.seconds - a.seconds)[0];
  const peakHour = recap.hours.reduce(
    (best, plays, hour) => (plays > recap.hours[best] ? hour : best),
    0,
  );
  const hasHours = recap.hours.some((plays) => plays > 0);
  const mostPlayed = recap.topTracks[0];
  const cover = mostPlayed?.track ?? hero[0];
  const topArtist = recap.topArtists[0];

  return (
    <div className="remix-page">
      <h2 className="sr-only" tabIndex={-1} ref={heading}>
        Remix
      </h2>

      <header className="remix-head">
        <p className="remix-subtitle">{weekRange(recap.start, recap.end)}</p>
        {confirming ? (
          <div className="remix-confirm" role="group" aria-label="Clear listening history">
            <span>Forget all of it?</span>
            <button
              className="text-button danger"
              onClick={async () => {
                setConfirming(false);
                await onClear();
              }}
            >
              Yes, clear
            </button>
            <button className="text-button" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button className="text-button quiet" onClick={() => setConfirming(true)}>
            Clear history
          </button>
        )}
      </header>

      {/* The week in one figure, with the sleeve of the song that earned it: a
          recap page, not a stack of stat cards. */}
      <section className="remix-lede" aria-label="This week">
        <div className="remix-lede-copy">
          <motion.p
            className="remix-figure"
            initial={animation.enabled ? { opacity: 0, y: 10 } : { opacity: 1 }}
            animate={{ opacity: 1, y: 0 }}
            transition={animation.wobble}
          >
            {seconds}
          </motion.p>
          <p className="remix-line">
            {recap.plays} {recap.plays === 1 ? 'play' : 'plays'} · {recap.tracks}{' '}
            {recap.tracks === 1 ? 'song' : 'songs'} · {recap.artists}{' '}
            {recap.artists === 1 ? 'artist' : 'artists'}
          </p>
          {recap.previousSeconds > 0 && (
            <p className="remix-compare" data-up={delta >= 0 ? 'true' : 'false'}>
              {delta >= 0 ? '+' : '−'}
              {listeningTime(Math.abs(delta))} vs last week
            </p>
          )}
        </div>
        {cover && (
          <button
            className="remix-lede-art"
            onClick={() => onPlay(hero, cover.id)}
            aria-label={`Play ${cover.title}`}
          >
            <Artwork track={cover} />
            <span>Most played</span>
          </button>
        )}
      </section>

      {/* Seven columns, one per day, under the figure they add up to. */}
      <section className="remix-week" aria-label="Listening per day">
        <div className="remix-bars" role="group" aria-label="Select a day">
          {recap.days.map((day, index) => {
            const today = index === recap.days.length - 1;
            const empty = day.seconds === 0;
            return (
              <button
                key={day.key}
                className={`remix-bar${today ? ' today' : ''}${hoveredDay === index ? ' hovered' : ''}`}
                onMouseEnter={() => setHoveredDay(index)}
                onMouseLeave={() => setHoveredDay(null)}
                onFocus={() => setHoveredDay(index)}
                onBlur={() => setHoveredDay(null)}
                onClick={() => setHoveredDay(index)}
                aria-label={`${weekday(day.at)} ${dayNumber(day.at)}: ${listeningTime(day.seconds)}`}
              >
                <motion.span
                  className="remix-bar-fill"
                  data-empty={empty ? 'true' : 'false'}
                  initial={{ height: animation.enabled ? 0 : `${(day.seconds / peak) * 100}%` }}
                  animate={{ height: `${Math.max(empty ? 2 : 6, (day.seconds / peak) * 100)}%` }}
                  transition={{ ...animation.wobble, delay: animation.enabled ? 0.05 * index : 0 }}
                />
                <span className="remix-bar-day">{weekday(day.at).slice(0, 1)}</span>
              </button>
            );
          })}
        </div>
        <p className="remix-caption">
          {hoveredDay === null
            ? busiestDay && busiestDay.seconds > 0
              ? `Most on ${weekday(busiestDay.at)}, ${listeningTime(busiestDay.seconds)}`
              : 'Quiet week'
            : `${listeningTime(recap.days[hoveredDay].seconds)} · ${recap.days[hoveredDay].plays} plays`}
        </p>
      </section>

      {/* Three things worth knowing, as one line of type rather than three cards. */}
      <p className="remix-notes">
        {recap.genres[0] && <span>Mostly {recap.genres[0].genre.toLowerCase()}</span>}
        {hasHours && <span>Usually around {String(peakHour).padStart(2, '0')}:00</span>}
        {topArtist && (
          <button onClick={() => onArtist(topArtist.artist)}>{topArtist.artist} most of all</button>
        )}
      </p>

      {hero.length > 0 && (
        <section className="remix-mix" aria-label="Your Remix">
          <div className="remix-mix-head">
            <div>
              <h3>Your Remix</h3>
              <p>{hero.length === 1 ? '1 song' : `${hero.length} songs`} you played this week.</p>
            </div>
            <div className="remix-mix-actions">
              <button className="filled-button" onClick={() => onPlay(hero, hero[0].id)}>
                <Play size={18} fill="currentColor" /> Play Remix
              </button>
              <button
                className="tonal-button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(hero);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Disc3 size={18} /> {saving ? 'Saving…' : 'Save as playlist'}
              </button>
            </div>
          </div>
          <ol className="remix-list">
            {hero.map((track, index) => {
              const entry = recap.topTracks.find((item) => item.track.id === track.id);
              const current = track.id === currentId;
              return (
                <motion.li
                  key={track.id}
                  className={current ? 'current' : ''}
                  initial={animation.enabled ? { opacity: 0, x: -8 } : { opacity: 1 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    ...animation.expressive,
                    delay: animation.enabled ? 0.03 * index : 0,
                  }}
                >
                  <span className="remix-rank">{index + 1}</span>
                  <button
                    className="remix-cover"
                    aria-label={`Play ${track.title}`}
                    onClick={() => onPlay(hero, track.id)}
                  >
                    <Artwork track={track} />
                    {current && playing && (
                      <span className="remix-playing" aria-label="Playing">
                        <span />
                        <span />
                      </span>
                    )}
                  </button>
                  <button className="remix-name" onClick={() => onPlay(hero, track.id)}>
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </button>
                  {entry && <span className="remix-count">{entry.plays}×</span>}
                </motion.li>
              );
            })}
          </ol>
        </section>
      )}

      {recap.topArtists.length > 0 && (
        <section className="remix-people" aria-label="Artists this week">
          {recap.topArtists.slice(0, 6).map((artist) => (
            <button key={artist.artist} onClick={() => onArtist(artist.artist)}>
              {artist.artist}
              <span>
                {artist.plays} {artist.plays === 1 ? 'play' : 'plays'}
              </span>
            </button>
          ))}
        </section>
      )}

      <footer className="remix-foot">
        <p>
          {listeningTime(summary.totalSeconds)} listened all time · {summary.totalPlays}{' '}
          {summary.totalPlays === 1 ? 'play' : 'plays'} · counted on this device, never uploaded.{' '}
          <button className="remix-link" onClick={onManageHistory}>
            Manage history
          </button>
        </p>
      </footer>
    </div>
  );
}
