import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, Disc3, Play, Users, Music2, ChevronDown } from './Glyphs';
import { ArtistPortrait } from './Artists';
import type { ArtistGroup } from '../domain/collections';
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

import { useT } from '../i18n';
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
  recap: currentRecap,
  history,
  artists = [],
  artistPhotos,
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
  artists?: ArtistGroup[];
  artistPhotos?: Map<string, string | undefined>;
  /** This week and the three before it, newest first. */
  history: WeekRecap[];
  loaded: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onArtist: (name: string) => void;
  onSave: (tracks: Track[], week: WeekRecap) => Promise<boolean> | boolean;
  onClear: () => Promise<void> | void;
  onAdd: () => void;
  /** Opens Settings on the section that shows what Wave keeps on this device. */
  onManageHistory: () => void;
}) {
  const t = useT();
  const animation = useWaveMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [section, setSection] = useState<'time' | 'artist' | 'song' | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [visibleWeeks, setVisibleWeeks] = useState(4);
  const recap = history.find((week) => week.start === selectedWeek) ?? currentRecap;
  const historical = recap.start !== currentRecap.start;
  const portrait = (name: string) => (
    <ArtistPortrait
      artist={
        artists.find((artist) => artist.name === name) ?? {
          name,
          tracks: [],
          albums: [],
          duration: 0,
        }
      }
      photo={artistPhotos?.get(name)}
    />
  );
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
          {t('Remix')}
        </h2>
        <EmptyState
          icon={<AudioLines size={40} strokeWidth={1.4} />}
          title={t('No week to look back on yet')}
          description="Import your files or add a YouTube song, play something, and this page fills in: your week in one number, and a Remix list made from what you actually played."
          hint={t('Kept on this device, never uploaded')}
          actions={
            <button className="tonal-button" onClick={onAdd}>
              {t('Add music')}
            </button>
          }
        />
      </div>
    );

  const hero = recap.plays ? recap.mix : [];
  const delta = recap.seconds - recap.previousSeconds;
  const peak = Math.max(1, ...recap.days.map((day) => day.seconds));
  const busiestDay = [...recap.days].sort((a, b) => b.seconds - a.seconds)[0];
  const mostPlayed = recap.topTracks[0];
  const topArtist = recap.topArtists[0];

  return (
    <div className="remix-page">
      <h2 className="sr-only" tabIndex={-1} ref={heading}>
        {t('Remix')}
      </h2>

      <header className="remix-head">
        <p className="remix-subtitle">{weekRange(recap.start, recap.end)}</p>
        {confirming ? (
          <div className="remix-confirm" role="group" aria-label={t('Clear listening history')}>
            <span>{t('Forget all of it?')}</span>
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

      <label className="remix-week-select form-field">
        {t('Explore a week')}
        <select
          value={recap.start}
          onChange={(event) => {
            setSelectedWeek(Number(event.target.value));
            setSection(null);
            setHoveredDay(null);
          }}
        >
          {history.map((week, index) => (
            <option key={week.start} value={week.start}>
              {index === 0 ? t('This week') + ' · ' : ''}
              {weekRange(week.start, week.end)} · {new Date(week.end).getFullYear()} · {week.plays}{' '}
              {t(week.plays === 1 ? 'play' : 'plays')}
            </option>
          ))}
        </select>
      </label>
      <div className="remix-highlights">
        {(
          [
            {
              id: 'time',
              label: 'Listening time',
              value: seconds,
              hint: historical ? t('Selected week') : t('This week'),
            },
            {
              id: 'artist',
              label: 'Top artist',
              value: topArtist?.artist ?? 'Still discovering',
              hint: t('Most played artist'),
            },
            {
              id: 'song',
              label: 'Top song',
              value: mostPlayed?.track.title ?? 'Still discovering',
              hint: mostPlayed?.track.artist ?? 'No plays yet',
            },
          ] as const
        ).map((card) => (
          <section className="remix-feature" key={card.id}>
            <motion.button
              type="button"
              className={`remix-highlight remix-highlight-${card.id}`}
              aria-expanded={section === card.id}
              aria-controls={`remix-${card.id}-panel`}
              onClick={() => {
                setSection(section === card.id ? null : card.id);
                window.dispatchEvent(new CustomEvent('wave:feature-used', { detail: 'Remix' }));
              }}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={animation.fast}
              whileTap={animation.enabled ? { scale: 0.98 } : undefined}
            >
              <span className="remix-highlight-label">
                {card.id === 'time' ? (
                  <AudioLines size={20} />
                ) : card.id === 'artist' ? (
                  <Users size={20} />
                ) : (
                  <Music2 size={20} />
                )}
                {t(card.label)}
              </span>
              <div className="remix-feature-image" aria-hidden="true">
                {card.id === 'artist' && topArtist ? (
                  portrait(topArtist.artist)
                ) : card.id === 'song' ? (
                  <Artwork track={mostPlayed?.track} />
                ) : (
                  <AudioLines size={52} strokeWidth={1.3} />
                )}
              </div>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
              <span className="remix-highlight-more">
                {section === card.id ? t('Hide details') : t('View details')}
                <ChevronDown size={16} />
              </span>
            </motion.button>
            <AnimatePresence initial={false}>
              {section === card.id && (
                <motion.div
                  key={section}
                  id={`remix-${section}-panel`}
                  className="remix-mini-panel"
                  initial={animation.enabled ? { opacity: 0, height: 0 } : false}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={animation.expressive}
                >
                  {section === 'time' && (
                    <>
                      <p className="remix-line">
                        {recap.plays} {t(recap.plays === 1 ? 'play' : 'plays')} · {recap.tracks}{' '}
                        {t(recap.tracks === 1 ? 'song' : 'songs')} · {recap.artists}{' '}
                        {t(recap.artists === 1 ? 'artist' : 'artists')}
                      </p>
                      {recap.previousSeconds > 0 && (
                        <p className="remix-compare">
                          {delta >= 0 ? '+' : '−'}
                          {listeningTime(Math.abs(delta))} vs last week
                        </p>
                      )}
                      {/* Seven columns, one per day, under the figure they add up to. */}
                      <section className="remix-week" aria-label={t('Listening per day')}>
                        <div className="remix-bars" role="group" aria-label={t('Select a day')}>
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
                                  initial={{
                                    height: animation.enabled
                                      ? 0
                                      : `${(day.seconds / peak) * 100}%`,
                                  }}
                                  animate={{
                                    height: `${Math.max(empty ? 2 : 6, (day.seconds / peak) * 100)}%`,
                                  }}
                                  transition={{
                                    ...animation.wobble,
                                    delay: animation.enabled ? 0.05 * index : 0,
                                  }}
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
                              : t('Quiet week')
                            : `${listeningTime(recap.days[hoveredDay].seconds)} · ${recap.days[hoveredDay].plays} plays`}
                        </p>
                      </section>
                    </>
                  )}
                  {section === 'artist' && (
                    <div className="remix-mini-list">
                      {recap.topArtists.slice(0, 5).map((artist, index) => (
                        <button
                          type="button"
                          key={artist.artist}
                          onClick={() => onArtist(artist.artist)}
                        >
                          <span>{index + 1}</span>
                          {portrait(artist.artist)}
                          <strong>{artist.artist}</strong>
                          <small>
                            {artist.plays} {t(artist.plays === 1 ? 'play' : 'plays')}
                          </small>
                          <span>↗</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {section === 'song' && (
                    <div className="remix-mini-list">
                      {recap.topTracks.slice(0, 5).map(({ track, plays }, index) => (
                        <button
                          type="button"
                          key={track.id}
                          onClick={() =>
                            onPlay(
                              recap.topTracks.map((item) => item.track),
                              track.id,
                            )
                          }
                        >
                          <span>{index + 1}</span>
                          <Artwork track={track} />
                          <strong>
                            {track.title}
                            <small>{track.artist}</small>
                          </strong>
                          <small>
                            {plays} {t(plays === 1 ? 'play' : 'plays')}
                          </small>
                          <Play size={18} />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        ))}
      </div>
      {hero.length > 0 && (
        <section className="remix-mix" aria-label={t('Your Remix')}>
          <div className="remix-mix-head">
            <div>
              <h3>{t('Your Remix')}</h3>
              <p>
                {hero.length === 1 ? '1 song' : `${hero.length} songs`}{' '}
                {historical ? t('played in this week.') : t('played this week.')}
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
                    await onSave(hero, recap);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Disc3 size={18} /> {saving ? t('Saving…') : t('Save as playlist')}
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
                      <span className="remix-playing" aria-label={t('Playing')}>
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

      {/*
        The weeks before this one. Remix used to forget everything on Monday; now
        up to a year can be explored, so a quiet week can be compared with the week that
        earned it, and any of them can be played again.
      */}
      {history.length > 1 && (
        <section className="remix-history" aria-label={t('Weeks before this one')}>
          <h3>{t('The weeks before')}</h3>
          <ol>
            {history.slice(1, visibleWeeks + 1).map((week) => {
              const top = week.topTracks[0];
              const quiet = week.plays === 0;
              return (
                <li key={week.start} data-quiet={quiet ? 'true' : 'false'}>
                  <span className="remix-history-when">
                    {weekRange(week.start, week.end).replace(/\s*–\s*/u, ' – ')}
                  </span>
                  <span className="remix-history-time">
                    {quiet ? t('Nothing played') : listeningTime(week.seconds)}
                  </span>
                  <span className="remix-history-note">
                    {quiet
                      ? t('A quiet week')
                      : `${week.plays} ${week.plays === 1 ? 'play' : 'plays'}${
                          top ? ` · ${top.track.title}` : ''
                        }`}
                  </span>
                  <button
                    type="button"
                    className="text-button remix-history-explore"
                    onClick={() => {
                      setSelectedWeek(week.start);
                      setSection(null);
                      setHoveredDay(null);
                      heading.current?.scrollIntoView({
                        behavior: animation.enabled ? 'smooth' : 'instant',
                        block: 'start',
                      });
                    }}
                  >
                    {t('Explore week')}
                  </button>
                  {!quiet && (
                    <button
                      className="text-button remix-history-play"
                      onClick={() => onPlay(week.mix, week.mix[0].id)}
                      disabled={!week.mix.length}
                    >
                      Play that week
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {visibleWeeks < history.length - 1 && (
            <button className="tonal-button" onClick={() => setVisibleWeeks((count) => count + 4)}>
              {t('Show more weeks')}
            </button>
          )}
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
