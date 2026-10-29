import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AudioLines, ArrowUpRight, Clock, Disc3, Play, Sparkles } from 'lucide-react';
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
 * Remix: the week you just had, and the playlist it earns.
 *
 * One card, one number, one list. The page is deliberately short — a week is a
 * thing you glance at, not a dashboard — and everything on it is counted from
 * plays this device wrote down: no taste profile, no recommendation, nothing
 * sent anywhere. "Your Remix" is those songs in the order they were played, and
 * it can be saved as an ordinary playlist like any other.
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
  onImport,
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
  onImport: () => void;
}) {
  const animation = useWaveMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  if (loaded && !summary.totalPlays)
    return (
      <div className="remix-page">
        <h2 className="remix-title" tabIndex={-1} ref={heading}>
          Remix
        </h2>
        <EmptyState
          icon={<AudioLines size={40} strokeWidth={1.4} />}
          title="No week to look back on yet"
          description="Play a song and this page fills in: your week in one number, and a Remix list made from what you actually played."
          hint="Kept on this device, never uploaded"
          actions={
            <button className="tonal-button" onClick={onImport}>
              Add music
            </button>
          }
        />
      </div>
    );

  const hero = recap.mix;
  const delta = recap.seconds - recap.previousSeconds;

  return (
    <div className="remix-page">
      <header className="remix-head">
        <h2 className="sr-only" tabIndex={-1} ref={heading}>
          Remix
        </h2>
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
        initial={animation.enabled ? { opacity: 0, y: 12 } : { opacity: 1 }}
        animate={{ opacity: 1, y: 0 }}
        transition={animation.effects}
      >
        <div className="remix-week-figure">
          <span className="remix-week-label">This week</span>
          <strong>{listeningTime(recap.seconds)}</strong>
          <span className="remix-week-detail">
            {recap.plays} {recap.plays === 1 ? 'play' : 'plays'} · {recap.tracks}{' '}
            {recap.tracks === 1 ? 'song' : 'songs'} · {recap.artists}{' '}
            {recap.artists === 1 ? 'artist' : 'artists'}
          </span>
          {recap.previousSeconds > 0 && (
            <span className="remix-delta" data-up={delta >= 0 ? 'true' : 'false'}>
              {delta >= 0 ? '+' : '−'}
              {listeningTime(Math.abs(delta))} vs last week
            </span>
          )}
        </div>
        {hero[0] && (
          <div className="remix-week-art" aria-hidden="true">
            {hero[1] && (
              <span className="remix-week-art-back">
                <Artwork track={hero[1]} />
              </span>
            )}
            <span className="remix-week-art-front">
              <Artwork track={hero[0]} />
            </span>
          </div>
        )}
      </motion.section>

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
                <li key={track.id} className={current ? 'current' : ''}>
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
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {recap.topArtists.length > 0 && (
        <section className="remix-artists" aria-label="Top artists this week">
          {recap.topArtists.map((artist) => (
            <button
              key={artist.artist}
              className="remix-artist"
              onClick={() => onArtist(artist.artist)}
              aria-label={`Open artist ${artist.artist}`}
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
            </button>
          ))}
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
