import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AudioLines,
  ArrowUpRight,
  Clock,
  Disc3,
  Flame,
  Play,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
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

/**
 * Remix: the week, wrapped.
 *
 * The page answers "what was this week" with a card, three facts, a chart of the
 * days, the songs it earned and the artists behind them. Everything is counted
 * from plays this device wrote down — no taste profile, no recommendation — and
 * the whole thing is a snapshot: a week you glance at, not a dashboard you
 * maintain. It leans on movement the way a recap should: numbers climb, bars
 * grow, the sleeve behind the week drifts a little.
 */
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
  const topGenre = recap.genres[0];
  const peakHour = recap.hours.reduce(
    (best, plays, hour) => (plays > recap.hours[best] ? hour : best),
    0,
  );
  const hasHours = recap.hours.some((plays) => plays > 0);
  const topArtist = recap.topArtists[0];
  const artistPlays = Math.max(1, ...recap.topArtists.map((artist) => artist.plays));

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

      <motion.section
        className="remix-week"
        aria-label="This week"
        initial={animation.enabled ? { opacity: 0, y: 18, scale: 0.985 } : { opacity: 1 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={animation.wobble}
      >
        {/* The week's own colour, drifting inside the card rather than over it. */}
        <div className="remix-aura" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="remix-week-figure">
          <span className="remix-week-label">
            <Sparkles size={13} /> Your week in music
          </span>
          <strong>{seconds}</strong>
          <span className="remix-week-detail">
            {recap.plays} {recap.plays === 1 ? 'play' : 'plays'} · {recap.tracks}{' '}
            {recap.tracks === 1 ? 'song' : 'songs'} · {recap.artists}{' '}
            {recap.artists === 1 ? 'artist' : 'artists'}
          </span>
          <div className="remix-week-chips">
            {recap.previousSeconds > 0 && (
              <span className="remix-delta" data-up={delta >= 0 ? 'true' : 'false'}>
                {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {delta >= 0 ? '+' : '−'}
                {listeningTime(Math.abs(delta))} vs last week
              </span>
            )}
            {topArtist && (
              <button className="remix-chip" onClick={() => onArtist(topArtist.artist)}>
                <Flame size={13} /> {topArtist.artist}
              </button>
            )}
          </div>
        </div>
        {hero[0] && (
          <div className="remix-week-art" aria-hidden="true">
            {hero[1] && (
              <motion.span
                className="remix-week-art-back"
                animate={animation.enabled ? { rotate: [-7, -5.4, -7] } : undefined}
                transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Artwork track={hero[1]} />
              </motion.span>
            )}
            <motion.span
              className="remix-week-art-front"
              animate={animation.enabled ? { y: [0, -4, 0] } : undefined}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Artwork track={hero[0]} />
            </motion.span>
          </div>
        )}
      </motion.section>

      {/* Three facts, the way a recap opens: who, when, what kind. */}
      <div className="remix-facts">
        {[
          {
            label: 'Top artist',
            value: topArtist?.artist ?? 'Nobody yet',
            detail: topArtist ? `${topArtist.plays} plays` : 'Play something',
            action: topArtist ? () => onArtist(topArtist.artist) : undefined,
          },
          {
            label: 'Busiest day',
            value: busiestDay && busiestDay.seconds > 0 ? weekday(busiestDay.at) : '—',
            detail:
              busiestDay && busiestDay.seconds > 0
                ? listeningTime(busiestDay.seconds)
                : 'Quiet week',
          },
          {
            label: 'Most played genre',
            value: topGenre?.genre ?? 'Untagged',
            detail: topGenre ? listeningTime(topGenre.seconds) : 'Add genre tags to sort this',
          },
        ].map((fact, index) => (
          <motion.div
            key={fact.label}
            className="remix-fact"
            initial={animation.enabled ? { opacity: 0, y: 14 } : { opacity: 1 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...animation.expressive, delay: animation.enabled ? 0.05 * index : 0 }}
          >
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
            <small>{fact.detail}</small>
            {fact.action && (
              <button
                className="remix-fact-link"
                onClick={fact.action}
                aria-label={`Open artist ${fact.value}`}
              >
                <ArrowUpRight size={15} />
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* The week as bars: one per day, growing into place. */}
      <section className="remix-chart" aria-label="Listening per day">
        <div className="remix-chart-head">
          <h3>How the week went</h3>
          <span>
            {hoveredDay === null
              ? 'Each bar is a day'
              : `${listeningTime(recap.days[hoveredDay].seconds)} · ${recap.days[hoveredDay].plays} plays`}
          </span>
        </div>
        <div
          className="remix-bars"
          role="img"
          aria-label={recap.days
            .map((day) => `${weekday(day.at)} ${dayNumber(day.at)}: ${listeningTime(day.seconds)}`)
            .join(', ')}
        >
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
                aria-label={`${weekday(day.at)} ${dayNumber(day.at)}: ${listeningTime(day.seconds)}`}
              >
                <motion.span
                  className="remix-bar-fill"
                  data-empty={empty ? 'true' : 'false'}
                  initial={{ height: animation.enabled ? 0 : `${(day.seconds / peak) * 100}%` }}
                  animate={{ height: `${Math.max(empty ? 3 : 8, (day.seconds / peak) * 100)}%` }}
                  transition={{ ...animation.wobble, delay: animation.enabled ? 0.06 * index : 0 }}
                />
                <span className="remix-bar-day">{weekday(day.at).slice(0, 1)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* When, in the day: a small area chart of the week's plays by hour. */}
      {hasHours && (
        <section className="remix-hours" aria-label="When you listen">
          <div className="remix-chart-head">
            <h3>When you listen</h3>
            <span>Around {`${String(peakHour).padStart(2, '0')}:00`}</span>
          </div>
          <div
            className="remix-hours-scale"
            role="img"
            aria-label={`Most plays around ${peakHour}:00`}
          >
            {recap.hours.map((plays, hour) => (
              <motion.span
                key={hour}
                initial={{ scaleY: animation.enabled ? 0 : 1 }}
                animate={{ scaleY: 1 }}
                transition={{ ...animation.wobble, delay: animation.enabled ? hour * 0.012 : 0 }}
                style={{ height: `${Math.max(4, (plays / Math.max(1, ...recap.hours)) * 100)}%` }}
                data-peak={hour === peakHour ? 'true' : 'false'}
              />
            ))}
          </div>
          <div className="remix-hours-labels" aria-hidden="true">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </section>
      )}

      {hero.length > 0 && (
        <section className="remix-mix" aria-label="Your Remix">
          <div className="remix-mix-head">
            <div>
              <h3>
                <Sparkles size={19} /> Your Remix
              </h3>
              <p>
                {hero.length === 1 ? 'The one song' : `${hero.length} songs`} you played most, in
                order. It becomes a playlist if you like it.
              </p>
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
        <section className="remix-artists" aria-label="Top artists this week">
          <h3 className="remix-artists-title">The artists behind it</h3>
          <div className="remix-artists-row">
            {recap.topArtists.map((artist, index) => (
              <motion.button
                key={artist.artist}
                className="remix-artist"
                onClick={() => onArtist(artist.artist)}
                aria-label={`Open artist ${artist.artist}`}
                initial={animation.enabled ? { opacity: 0, y: 10 } : { opacity: 1 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...animation.expressive,
                  delay: animation.enabled ? 0.05 * index : 0,
                }}
              >
                <span className="remix-artist-art">
                  {artist.artwork ? (
                    <img src={artist.artwork} alt="" />
                  ) : (
                    <span aria-hidden="true">{artist.artist.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
                <span className="remix-artist-name">
                  <strong>{artist.artist}</strong>
                  <small>
                    {artist.plays} {artist.plays === 1 ? 'play' : 'plays'} this week
                  </small>
                </span>
                {/* A bar the width of their share of the week, not a score. */}
                <motion.span
                  className="remix-artist-bar"
                  aria-hidden="true"
                  initial={{ scaleX: animation.enabled ? 0 : 1 }}
                  animate={{ scaleX: 1 }}
                  transition={{ ...animation.wobble, delay: animation.enabled ? 0.08 * index : 0 }}
                  style={{ width: `${Math.round((artist.plays / artistPlays) * 100)}%` }}
                />
              </motion.button>
            ))}
          </div>
        </section>
      )}

      <footer className="remix-foot">
        <p>
          <Clock size={15} /> {listeningTime(summary.totalSeconds)} listened all time ·{' '}
          {summary.totalPlays} {summary.totalPlays === 1 ? 'play' : 'plays'}
        </p>
        <p>
          Counted on this device, never uploaded. A song counts once you have heard half of it.{' '}
          <a className="remix-link" href="#settings-storage">
            Manage history <ArrowUpRight size={14} />
          </a>
        </p>
      </footer>
    </div>
  );
}
