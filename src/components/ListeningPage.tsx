import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AudioLines, Clock, Flame, Heart, Play, Trash2, Users } from 'lucide-react';
import { Artwork } from './Artwork';
import { EmptyState } from './EmptyState';
import { useWaveMotion } from '../ui/motion';
import { formatTime, type Track } from '../domain/types';
import { listeningTime, timeAgo, type ListeningSummary, type PlayEvent } from '../domain/listening';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * What was listened to, and how much.
 *
 * This is the one page in Wave that looks backwards. It is built from the same
 * rows the player writes as songs end, so nothing here is an estimate of taste
 * or a recommendation: it is a count of plays and seconds, on this device.
 * Deleted songs keep their seconds in the totals and disappear from the lists.
 */
export function ListeningPage({
  summary,
  loaded,
  currentId,
  playing,
  onPlay,
  onFavorite,
  onArtist,
  onClear,
  onImport,
}: {
  summary: ListeningSummary;
  loaded: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], id: string) => void;
  onFavorite: (track: Track) => void;
  onArtist: (name: string) => void;
  onClear: () => Promise<void> | void;
  onImport: () => void;
}) {
  const animation = useWaveMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  if (loaded && !summary.totalPlays)
    return (
      <div className="listening-page">
        <h2 className="listening-title" tabIndex={-1} ref={heading}>
          Listening
        </h2>
        <EmptyState
          icon={<AudioLines size={40} strokeWidth={1.4} />}
          title="Nothing listened to yet"
          description="Play a song and it will show up here, with how much you have listened this week."
          hint="Kept on this device, never uploaded"
          actions={
            <button className="tonal-button" onClick={onImport}>
              Add music
            </button>
          }
        />
      </div>
    );

  const peak = Math.max(...summary.days.map((day) => day.seconds), 1);
  const topTracks = summary.topTracks.map((entry) => entry.track);
  const tiles = [
    {
      icon: <Clock size={18} />,
      value: listeningTime(summary.weekSeconds),
      label: 'Listened this week',
    },
    { icon: <Flame size={18} />, value: `${summary.weekPlays}`, label: 'Plays this week' },
    { icon: <AudioLines size={18} />, value: `${summary.uniqueTracks}`, label: 'Songs heard' },
    { icon: <Users size={18} />, value: `${summary.uniqueArtists}`, label: 'Artists heard' },
  ];

  return (
    <div className="listening-page">
      <header className="listening-head">
        <div>
          <h2 className="listening-title" tabIndex={-1} ref={heading}>
            Listening
          </h2>
          <p className="listening-subtitle">
            {summary.totalPlays} {summary.totalPlays === 1 ? 'play' : 'plays'} ·{' '}
            {listeningTime(summary.totalSeconds)} in total · kept on this device
          </p>
        </div>
        {confirming ? (
          <div className="listening-confirm" role="group" aria-label="Clear listening history">
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
          <button className="text-button" onClick={() => setConfirming(true)}>
            <Trash2 size={17} />
            Clear history
          </button>
        )}
      </header>

      <div className="listening-tiles">
        {tiles.map((tile, index) => (
          <motion.div
            key={tile.label}
            className="listening-tile"
            initial={animation.enabled ? { opacity: 0, y: 10 } : { opacity: 1 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...animation.effects, delay: animation.enabled ? index * 0.04 : 0 }}
          >
            <span className="listening-tile-icon" aria-hidden="true">
              {tile.icon}
            </span>
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </motion.div>
        ))}
      </div>

      <section className="listening-chart" aria-label="Listening over the last two weeks">
        <div className="section-heading">
          <h3>Last two weeks</h3>
          <span className="listening-chart-total">
            {listeningTime(summary.monthSeconds)} this month
          </span>
        </div>
        <ol className="listening-bars">
          {summary.days.map((day, index) => {
            const date = new Date(day.at);
            const today = index === summary.days.length - 1;
            return (
              <li
                key={day.key}
                className={today ? 'today' : ''}
                data-empty={day.seconds ? undefined : 'true'}
                title={`${dayLabel(day.key)}: ${day.seconds ? listeningTime(day.seconds) : 'nothing'}`}
              >
                <span className="listening-bar-track">
                  <motion.span
                    className="listening-bar"
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max(day.seconds ? 6 : 2, (day.seconds / peak) * 100)}%`,
                    }}
                    transition={
                      animation.enabled
                        ? { ...animation.reveal, delay: index * 0.015 }
                        : { duration: 0 }
                    }
                  />
                </span>
                <span className="listening-bar-day" aria-hidden="true">
                  {DAY_LABELS[date.getDay()][0]}
                </span>
                <span className="sr-only">{`${dayLabel(day.key)}: ${
                  day.seconds ? listeningTime(day.seconds) : 'nothing'
                }`}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {summary.topTracks.length > 0 && (
        <section className="listening-section" aria-label="Most played songs">
          <div className="section-heading">
            <h3>Most played</h3>
            <button className="text-button" onClick={() => onPlay(topTracks, topTracks[0].id)}>
              <Play size={17} />
              Play all
            </button>
          </div>
          <ol className="listening-list">
            {summary.topTracks.map((entry, index) => (
              <li key={entry.track.id} className={entry.track.id === currentId ? 'current' : ''}>
                <span className="listening-rank">{index + 1}</span>
                <button
                  className="listening-cover"
                  aria-label={`Play ${entry.track.title}`}
                  onClick={() => onPlay(topTracks, entry.track.id)}
                >
                  <Artwork track={entry.track} />
                </button>
                <button
                  className="listening-name"
                  onClick={() => onPlay(topTracks, entry.track.id)}
                >
                  <strong>{entry.track.title}</strong>
                  <span>{entry.track.artist}</span>
                </button>
                <span className="listening-count">
                  {entry.plays} {entry.plays === 1 ? 'play' : 'plays'}
                  <small>{listeningTime(entry.seconds)}</small>
                </span>
                <button
                  className={`icon-button ${entry.track.favorite ? 'active' : ''}`}
                  aria-label={`${entry.track.favorite ? 'Unfavorite' : 'Favorite'} ${entry.track.title}`}
                  aria-pressed={entry.track.favorite}
                  onClick={() => onFavorite(entry.track)}
                >
                  <Heart size={19} fill={entry.track.favorite ? 'currentColor' : 'none'} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {summary.topArtists.length > 0 && (
        <section className="listening-section" aria-label="Most played artists">
          <div className="section-heading">
            <h3>Artists</h3>
          </div>
          <div className="listening-artists">
            {summary.topArtists.map((artist) => (
              <button
                key={artist.artist}
                className="listening-artist"
                onClick={() => onArtist(artist.artist)}
                aria-label={`Open artist ${artist.artist}`}
              >
                {artist.artwork ? (
                  <img src={artist.artwork} alt="" />
                ) : (
                  <span className="listening-artist-fallback" aria-hidden="true">
                    {artist.artist.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>
                  <strong>{artist.artist}</strong>
                  <small>
                    {artist.plays} {artist.plays === 1 ? 'play' : 'plays'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {summary.recent.length > 0 && (
        <section className="listening-section" aria-label="Recent plays">
          <div className="section-heading">
            <h3>Recent</h3>
          </div>
          <ol className="listening-recent">
            {summary.recent.map((play) => (
              <RecentRow
                key={play.id}
                play={play}
                current={play.trackId === currentId}
                playing={playing}
                onPlay={() => onPlay([play.track], play.track.id)}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function RecentRow({
  play,
  current,
  playing,
  onPlay,
}: {
  play: PlayEvent & { track: Track };
  current: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <li className={current ? 'current' : ''}>
      <button
        className="listening-cover small"
        aria-label={`Play ${play.track.title}`}
        onClick={onPlay}
      >
        <Artwork track={play.track} />
      </button>
      <button className="listening-name" onClick={onPlay}>
        <strong>{play.track.title}</strong>
        <span>{play.track.artist}</span>
      </button>
      <span className="listening-when">
        {current && playing ? (
          <small className="listening-playing">Playing</small>
        ) : (
          <small>{timeAgo(play.at)}</small>
        )}
        <small className="listening-length">{formatTime(play.seconds)}</small>
      </span>
    </li>
  );
}
