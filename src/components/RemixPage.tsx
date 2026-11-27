import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { AudioLines, Disc3, Play, Users, Music2, ChevronDown } from './Glyphs';
import { ArtistPortrait } from './Artists';
import type { ArtistGroup } from '../domain/collections';
import { Artwork } from './Artwork';
import { EmptyState } from './EmptyState';
import { useWaveMotion } from '../ui/motion';
import type { Track } from '../domain/types';
import { isYouTubeTrack } from '../domain/youtubeTrack';
import { useOnline } from '../ui/network';
import {
  listeningTime,
  weekRange,
  type ListeningSummary,
  type PeriodRecap,
  type RecapPeriod,
  type WeekRecap,
} from '../domain/listening';

import { useT } from '../i18n';

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
      const current = Math.round(origin + (value - origin) * eased);
      from.current = current;
      setShown(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    });
    return () => cancelAnimationFrame(frame);
  }, [value, enabled]);
  return shown;
}

function PeriodStage({ direction, children }: { direction: number; children: ReactNode }) {
  const present = useIsPresent();
  const animation = useWaveMotion();
  return (
    <motion.div
      className="remix-period-stage"
      inert={!present}
      aria-hidden={!present}
      initial={animation.enabled ? { opacity: 0, x: direction * 20 } : false}
      animate={{ opacity: 1, x: 0 }}
      variants={{
        exit: (nextDirection: number) =>
          animation.enabled ? { opacity: 0, x: -nextDirection * 12 } : { opacity: 0 },
      }}
      exit="exit"
      transition={
        animation.enabled ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }
      }
    >
      {children}
    </motion.div>
  );
}

function useTimeCountUp(seconds: number, enabled: boolean) {
  const shown = useCountUp(seconds, enabled);

  return seconds >= 60 ? listeningTime(shown) : listeningTime(seconds);
}

const weekday = (at: number) => new Date(at).toLocaleDateString(undefined, { weekday: 'short' });
const dayNumber = (at: number) => new Date(at).getDate();

export function RemixPage({
  summary,
  listenerName,
  recap: currentRecap,
  history,
  monthlyHistory = [],
  yearlyHistory = [],
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
  listenerName?: string;

  recap: WeekRecap;
  artists?: ArtistGroup[];
  artistPhotos?: Map<string, string | undefined>;

  history: WeekRecap[];

  monthlyHistory?: PeriodRecap[];

  yearlyHistory?: PeriodRecap[];
  loaded: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onArtist: (name: string) => void;
  onSave: (
    tracks: Track[],
    recap: Pick<WeekRecap, 'start' | 'end'> & { label?: string },
  ) => Promise<boolean> | boolean;
  onClear: () => Promise<void> | void;
  onAdd: () => void;

  onManageHistory: () => void;
}) {
  const t = useT();
  const online = useOnline();
  const animation = useWaveMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [period, setPeriod] = useState<RecapPeriod>('week');
  const [periodDirection, setPeriodDirection] = useState<1 | -1>(1);
  const periodOrder: Record<RecapPeriod, number> = { week: 0, month: 1, year: 2 };
  const choosePeriod = (next: RecapPeriod) => {
    if (next === period) return;
    setPeriodDirection(periodOrder[next] >= periodOrder[period] ? 1 : -1);
    setPeriod(next);
    setSection(null);
    setHoveredDay(null);
  };
  const [section, setSection] = useState<'time' | 'artist' | 'song' | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [visibleWeeks, setVisibleWeeks] = useState(4);
  const availableWeeks = history.filter((week) => week.plays > 0);
  const earlierWeeks = availableWeeks.filter((week) => week.start !== currentRecap.start);
  const weekRecap =
    availableWeeks.find((week) => week.start === selectedWeek) ??
    (currentRecap.plays ? currentRecap : (availableWeeks[0] ?? currentRecap));
  const historicalWeek = weekRecap.start !== currentRecap.start;

  const availableMonths = monthlyHistory.filter((month) => month.plays > 0);
  const currentMonth = monthlyHistory[0];
  const monthRecap =
    availableMonths.find((month) => month.key === selectedMonth) ??
    (currentMonth?.plays ? currentMonth : (availableMonths[0] ?? currentMonth));

  const availableYears = yearlyHistory.filter((year) => year.plays > 0);
  const currentYear = yearlyHistory[0];
  const yearRecap =
    availableYears.find((year) => year.key === selectedYear) ??
    (currentYear?.plays ? currentYear : (availableYears[0] ?? currentYear));

  const activePeriodRecap =
    period === 'month' ? monthRecap : period === 'year' ? yearRecap : undefined;
  const recap = period === 'week' || !activePeriodRecap ? weekRecap : activePeriodRecap;
  const historical =
    period === 'week'
      ? historicalWeek
      : period === 'month'
        ? !!monthRecap && !!currentMonth && monthRecap.key !== currentMonth.key
        : !!yearRecap && !!currentYear && yearRecap.key !== currentYear.key;
  const hasMonthOrYear = monthlyHistory.length > 0 || yearlyHistory.length > 0;
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
        {listenerName && (
          <p className="remix-personal">{t('Your Remix, {name}', { name: listenerName })}</p>
        )}
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
  const chartItems =
    period === 'week' || !activePeriodRecap
      ? weekRecap.days.map((day, index) => ({
          key: day.key,
          label: `${weekday(day.at)} ${dayNumber(day.at)}`,
          shortLabel: weekday(day.at).slice(0, 1),
          fullName: weekday(day.at),
          seconds: day.seconds,
          plays: day.plays,
          isCurrent: index === weekRecap.days.length - 1,
        }))
      : activePeriodRecap.buckets.map((bucket, index, list) => ({
          key: bucket.key,
          label: bucket.label,
          shortLabel: bucket.shortLabel,
          fullName: bucket.label,
          seconds: bucket.seconds,
          plays: bucket.plays,
          isCurrent: !historical && index === list.length - 1,
        }));
  const peak = Math.max(1, ...chartItems.map((item) => item.seconds));
  const busiest = [...chartItems].sort((a, b) => b.seconds - a.seconds)[0];
  const mostPlayed = recap.topTracks[0];
  const topArtist = recap.topArtists[0];
  const subtitle =
    period === 'week' || !activePeriodRecap
      ? weekRange(weekRecap.start, weekRecap.end)
      : activePeriodRecap.label;
  const compareLabel =
    period === 'month'
      ? t('vs last month')
      : period === 'year'
        ? t('vs last year')
        : 'vs last week';
  const timeHint =
    period === 'month'
      ? historical
        ? t('Selected month')
        : t('This month')
      : period === 'year'
        ? historical
          ? t('Selected year')
          : t('This year')
        : historical
          ? t('Selected week')
          : t('This week');

  return (
    <div className="remix-page">
      <h2 className="sr-only" tabIndex={-1} ref={heading}>
        {t('Remix')}
      </h2>

      <header className="remix-head">
        <div className="remix-head-copy">
          {listenerName && (
            <p className="remix-personal">{t('Your Remix, {name}', { name: listenerName })}</p>
          )}
          <p className="remix-subtitle">{subtitle}</p>
          {hasMonthOrYear && (
            <div className="remix-period-tabs" role="tablist" aria-label={t('Recap period')}>
              {(
                [
                  { id: 'week', label: t('Weekly') },
                  { id: 'month', label: t('Monthly') },
                  { id: 'year', label: t('Yearly') },
                ] as const
              ).map((tab) => {
                const active = period === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`remix-period-tab${active ? ' active' : ''}`}
                    onClick={() => choosePeriod(tab.id)}
                  >
                    {active && (
                      <motion.span
                        className="remix-period-pill"
                        layoutId="remix-period-pill"
                        transition={animation.fast}
                        aria-hidden="true"
                      />
                    )}
                    <span className="remix-period-tab__label">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
              {t('Yes, clear')}
            </button>
            <button className="text-button" onClick={() => setConfirming(false)}>
              {t('Keep it')}
            </button>
          </div>
        ) : (
          <button className="text-button quiet" onClick={() => setConfirming(true)}>
            {t('Clear history')}
          </button>
        )}
      </header>

      <div className="remix-period-transition">
        <AnimatePresence initial={false} custom={periodDirection}>
          <PeriodStage key={period} direction={periodDirection}>
            {period === 'week' && availableWeeks.length > 0 && (
              <label className="remix-week-select form-field">
                {t('Explore a week')}
                <select
                  value={weekRecap.start}
                  onChange={(event) => {
                    setSelectedWeek(Number(event.target.value));
                    setSection(null);
                    setHoveredDay(null);
                  }}
                >
                  {availableWeeks.map((week) => (
                    <option key={week.start} value={week.start}>
                      {week.start === currentRecap.start ? t('This week') + ' · ' : ''}
                      {weekRange(week.start, week.end)} · {new Date(week.end).getFullYear()} ·{' '}
                      {week.plays} {t(week.plays === 1 ? 'play' : 'plays')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {period === 'month' && availableMonths.length > 0 && monthRecap && (
              <label className="remix-week-select form-field">
                {t('Explore a month')}
                <select
                  value={monthRecap.key}
                  onChange={(event) => {
                    setSelectedMonth(event.target.value);
                    setSection(null);
                    setHoveredDay(null);
                  }}
                >
                  {availableMonths.map((month) => (
                    <option key={month.key} value={month.key}>
                      {currentMonth && month.key === currentMonth.key
                        ? t('This month') + ' · '
                        : ''}
                      {month.label} · {month.plays} {t(month.plays === 1 ? 'play' : 'plays')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {period === 'year' && availableYears.length > 0 && yearRecap && (
              <label className="remix-week-select form-field">
                {t('Explore a year')}
                <select
                  value={yearRecap.key}
                  onChange={(event) => {
                    setSelectedYear(event.target.value);
                    setSection(null);
                    setHoveredDay(null);
                  }}
                >
                  {availableYears.map((year) => (
                    <option key={year.key} value={year.key}>
                      {currentYear && year.key === currentYear.key ? t('This year') + ' · ' : ''}
                      {year.label} · {year.plays} {t(year.plays === 1 ? 'play' : 'plays')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="remix-highlights">
              {(
                [
                  {
                    id: 'time',
                    label: 'Listening time',
                    value: seconds,
                    hint: timeHint,
                  },
                  {
                    id: 'artist',
                    label: 'Top artist',
                    value: topArtist?.artist ?? t('Still discovering'),
                    hint: t('Most played artist'),
                  },
                  {
                    id: 'song',
                    label: 'Top song',
                    value: mostPlayed?.track.title ?? t('Still discovering'),
                    hint: mostPlayed?.track.artist ?? t('No plays yet'),
                  },
                ] as const
              ).map((card, index) => (
                <motion.section
                  layout={animation.enabled ? 'position' : false}
                  initial={animation.enabled ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...animation.lateral, delay: animation.enabled ? index * 0.05 : 0 }}
                  className={`remix-feature${section === card.id ? ' is-expanded' : ''}`}
                  key={card.id}
                >
                  <motion.button
                    type="button"
                    className={`remix-highlight remix-highlight-${card.id}`}
                    aria-expanded={section === card.id}
                    aria-controls={`remix-${card.id}-panel`}
                    onClick={() => {
                      setSection(section === card.id ? null : card.id);
                      window.dispatchEvent(
                        new CustomEvent('wave:feature-used', { detail: 'Remix' }),
                      );
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
                              {recap.plays} {t(recap.plays === 1 ? 'play' : 'plays')} ·{' '}
                              {recap.tracks} {t(recap.tracks === 1 ? 'song' : 'songs')} ·{' '}
                              {recap.artists} {t(recap.artists === 1 ? 'artist' : 'artists')}
                            </p>
                            {recap.previousSeconds > 0 && (
                              <p className="remix-compare">
                                {delta >= 0 ? '+' : '−'}
                                {listeningTime(Math.abs(delta))} {compareLabel}
                              </p>
                            )}
                            {}
                            <section
                              className={`remix-week remix-bars-${period}`}
                              aria-label={
                                period === 'month'
                                  ? t('Listening per week')
                                  : period === 'year'
                                    ? t('Listening per month')
                                    : t('Listening per day')
                              }
                            >
                              <div
                                className="remix-bars"
                                role="group"
                                aria-label={
                                  period === 'month'
                                    ? t('Select a week')
                                    : period === 'year'
                                      ? t('Select a month')
                                      : t('Select a day')
                                }
                              >
                                {chartItems.map((item, index) => {
                                  const empty = item.seconds === 0;
                                  return (
                                    <button
                                      key={item.key}
                                      className={`remix-bar${item.isCurrent ? ' today' : ''}${hoveredDay === index ? ' hovered' : ''}`}
                                      onMouseEnter={() => setHoveredDay(index)}
                                      onMouseLeave={() => setHoveredDay(null)}
                                      onFocus={() => setHoveredDay(index)}
                                      onBlur={() => setHoveredDay(null)}
                                      onClick={() => setHoveredDay(index)}
                                      aria-label={`${item.label}: ${listeningTime(item.seconds)}`}
                                    >
                                      <motion.span
                                        className="remix-bar-fill"
                                        data-empty={empty ? 'true' : 'false'}
                                        initial={{
                                          height: animation.enabled
                                            ? 0
                                            : `${(item.seconds / peak) * 100}%`,
                                        }}
                                        animate={{
                                          height: `${Math.max(empty ? 2 : 6, (item.seconds / peak) * 100)}%`,
                                        }}
                                        transition={{
                                          ...animation.wobble,
                                          delay: animation.enabled ? 0.04 * index : 0,
                                        }}
                                      />
                                      <span className="remix-bar-day">{item.shortLabel}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="remix-caption">
                                {hoveredDay === null || !chartItems[hoveredDay]
                                  ? busiest && busiest.seconds > 0
                                    ? period === 'week'
                                      ? `Most on ${busiest.fullName}, ${listeningTime(busiest.seconds)}`
                                      : `${t('Peak')}: ${busiest.fullName}, ${listeningTime(busiest.seconds)}`
                                    : period === 'month'
                                      ? t('Quiet month')
                                      : period === 'year'
                                        ? t('Quiet year')
                                        : t('Quiet week')
                                  : `${chartItems[hoveredDay].fullName} · ${listeningTime(chartItems[hoveredDay].seconds)} · ${chartItems[hoveredDay].plays} ${t(chartItems[hoveredDay].plays === 1 ? 'play' : 'plays')}`}
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
                </motion.section>
              ))}
            </div>
            {hero.length > 0 && (
              <section className="remix-mix" aria-label={t('Your Remix')}>
                <div className="remix-mix-head">
                  <div>
                    <h3>{t('Your Remix')}</h3>
                    <p>
                      {hero.length === 1 ? '1 song' : `${hero.length} songs`}{' '}
                      {period === 'month'
                        ? historical
                          ? t('played in this month.')
                          : t('played this month.')
                        : period === 'year'
                          ? historical
                            ? t('played in this year.')
                            : t('played this year.')
                          : historical
                            ? t('played in this week.')
                            : t('played this week.')}
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
                    const offlineTrack = !online && isYouTubeTrack(track);
                    return (
                      <motion.li
                        key={track.id}
                        className={`${current ? 'current' : ''}${offlineTrack ? ' is-offline-track' : ''}`.trim()}
                        aria-disabled={offlineTrack || undefined}
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
                          disabled={offlineTrack}
                          aria-label={
                            offlineTrack
                              ? t('{title} requires an internet connection', { title: track.title })
                              : `Play ${track.title}`
                          }
                          onClick={() => {
                            if (!offlineTrack) onPlay(hero, track.id);
                          }}
                        >
                          <Artwork track={track} />
                          {current && playing && (
                            <span className="remix-playing" aria-label={t('Playing')}>
                              <span />
                              <span />
                            </span>
                          )}
                        </button>
                        <button
                          className="remix-name"
                          disabled={offlineTrack}
                          onClick={() => {
                            if (!offlineTrack) onPlay(hero, track.id);
                          }}
                        >
                          <strong>
                            {track.title}
                            {offlineTrack && (
                              <span className="offline-track-pill">{t('Offline')}</span>
                            )}
                          </strong>
                          <span>{track.artist}</span>
                        </button>
                        {entry && <span className="remix-count">{entry.plays}×</span>}
                      </motion.li>
                    );
                  })}
                </ol>
              </section>
            )}

            {}
            {period === 'week' && earlierWeeks.length > 0 && (
              <section className="remix-history" aria-label={t('Weeks before this one')}>
                <h3>{t('The weeks before')}</h3>
                <ol>
                  {earlierWeeks.slice(0, visibleWeeks).map((week) => {
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
                {visibleWeeks < earlierWeeks.length && (
                  <button
                    className="tonal-button"
                    onClick={() => setVisibleWeeks((count) => count + 4)}
                  >
                    {t('Show more weeks')}
                  </button>
                )}
              </section>
            )}
          </PeriodStage>
        </AnimatePresence>
      </div>

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
