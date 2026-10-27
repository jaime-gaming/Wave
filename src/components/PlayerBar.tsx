import { MusicLighting } from './MusicLighting';
import { VideoBackdrop } from './VideoBackdrop';
import { YouTubeStage } from './YouTubeStage';
import { useIdleListening } from '../hooks/useIdleListening';
import { MixVisual } from './MixVisual';
import { WaveSeek } from './WaveSeek';
import { LyricsPanel } from './LyricsPanel';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import type { RefObject } from 'react';
import {
  ChevronDown,
  Captions,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Film,
} from 'lucide-react';
import { Artwork } from './Artwork';
import { Modal } from './Modal';
import { formatTime, type Track } from '../domain/types';
import type { usePlayer } from '../hooks/usePlayer';
import { useArtworkColor } from '../hooks/useArtworkColor';

type PlayerProps = {
  player: ReturnType<typeof usePlayer>;
  onFavorite: (track: Track) => void;
  expanded: boolean;
  onExpanded: (value: boolean) => void;
  onOpen: (opener: HTMLButtonElement) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  queueOpen: boolean;
  onQueue: () => void;
  /** Word-by-word lyric highlighting. */
  karaoke?: boolean;
  /** Video clip backdrop, driven by the same transport. */
  videoClip?: boolean;
  onToggleVideoClip?: () => void;
  onLyrics: (track: Track) => void;
  onSaveLyrics?: (id: string, lyrics: import('../domain/lyrics').Lyrics) => Promise<boolean>;
  lyricsOpen?: boolean;
  lyricsLoading?: boolean;
  automaticLyrics?: boolean;
  onRetryLyrics?: (id: string) => void;
  onArtist?: (name: string) => void;
  onAlbum?: (track: Track) => void;
  onDisclosure?: (open: boolean) => void;
};

function PlaySymbol({ playing, size }: { playing: boolean; size: number }) {
  const animation = useWaveMotion();
  return (
    <span className="play-symbol-slot" style={{ width: size, height: size }}>
      <AnimatePresence initial={false} mode="sync">
        <motion.span
          key={playing ? 'pause' : 'play'}
          className="play-symbol"
          aria-hidden="true"
          initial={{
            opacity: animation.enabled ? 0 : 1,
            rotate: animation.enabled ? -15 : 0,
            y: animation.enabled ? 5 : 0,
          }}
          animate={{ opacity: 1, rotate: 0, y: 0 }}
          exit={{ opacity: 0, rotate: animation.enabled ? 15 : 0, y: animation.enabled ? -5 : 0 }}
          transition={animation.effects}
        >
          {playing ? <Pause size={size} /> : <Play size={size} />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function PlayerDetails({
  player,
  onFavorite,
  lyricsOpen,
  onLyrics,
  lyricsLoading,
  automaticLyrics,
  onRetryLyrics,
  onSaveLyrics,
  onDisclosure,
  onArtist,
  onAlbum,
  readerActive = true,
  videoClip = false,
  onToggleVideoClip,
}: PlayerProps & { readerActive?: boolean }) {
  const { current, state, time, duration, volume, dispatch } = player;
  const animation = useWaveMotion();
  return (
    <>
      <div className="stage-layout">
        <motion.div
          className="stage-record"
          layout={animation.enabled ? 'position' : false}
          transition={animation.spatial}
        >
          <button
            className="stage-cover"
            aria-label={state.playing ? 'Pause from artwork' : 'Play from artwork'}
            disabled={!current}
            onClick={() => dispatch({ type: 'toggle' })}
          >
            {player.blend ? (
              <MixVisual blend={player.blend} artworkClassName="stage-artwork" />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {' '}
                <motion.div
                  className="stage-cover-transition"
                  key={`${current?.id ?? 'empty'}:${current?.editedAt ?? 0}`}
                  initial={{
                    opacity: animation.enabled ? 0 : 1,
                    scale: animation.enabled ? 0.92 : 1,
                    y: animation.enabled ? 16 : 0,
                    rotate: animation.enabled ? -2 : 0,
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                  exit={{ opacity: 0, scale: animation.enabled ? 1.025 : 1 }}
                  transition={{ ...animation.spatial, opacity: animation.effects }}
                >
                  <Artwork track={current} className="stage-artwork" />
                </motion.div>
              </AnimatePresence>
            )}
          </button>
          <motion.div
            className="stage-track"
            key={current?.id}
            initial={animation.enabled ? { opacity: 0, y: 8 } : { opacity: 1 }}
            animate={{ opacity: 1, y: 0 }}
            transition={animation.effects}
          >
            <h3 title={current?.title}>{current?.title ?? 'Nothing playing'}</h3>
            {current ? (
              <div className="stage-metadata">
                <button
                  className="metadata-link"
                  onClick={() => onArtist?.(current.artist)}
                  aria-label={`Open artist ${current.artist}`}
                >
                  {current.artist}
                </button>
                <button
                  className="metadata-link stage-album"
                  onClick={() => onAlbum?.(current)}
                  aria-label={`Open album ${current.album}`}
                >
                  {current.album}
                </button>
              </div>
            ) : (
              <p>Choose a song from your library.</p>
            )}
          </motion.div>
        </motion.div>
        <div className="stage-controls">
          <div className="stage-transport" data-playing={state.playing && !player.buffering}>
            <WaveSeek
              time={time}
              duration={duration}
              playing={state.playing && !player.buffering}
              onSeek={player.seek}
            />
            <div className="stage-times">
              <span>{formatTime(time)}</span>
              <span>{formatTime(duration || current?.duration || 0)}</span>
            </div>
            <div className="stage-buttons">
              <button
                className="stage-skip"
                onClick={player.previous}
                aria-label="Previous track"
                disabled={!current}
              >
                <SkipBack size={27} />
              </button>
              <motion.button
                className={`stage-play ${state.playing ? 'is-playing' : ''}`}
                animate={{ borderRadius: state.playing ? '27px' : '48px' }}
                whileTap={animation.enabled ? { scale: 0.9 } : undefined}
                transition={animation.fast}
                onClick={() => dispatch({ type: 'toggle' })}
                aria-label={state.playing ? 'Pause' : 'Play'}
                disabled={!current}
              >
                <PlaySymbol playing={state.playing} size={32} />
              </motion.button>
              <button
                className="stage-skip"
                onClick={() => dispatch({ type: 'next' })}
                aria-label="Next track"
                disabled={!current}
              >
                <SkipForward size={27} />
              </button>
            </div>
            <div className="stage-modes">
              <button
                className={state.shuffled ? 'active' : ''}
                onClick={player.shuffle}
                aria-label="Shuffle"
                aria-pressed={state.shuffled}
                disabled={!current}
              >
                <Shuffle size={22} />
              </button>
              <button
                className={state.repeat !== 'off' ? 'active' : ''}
                onClick={() => dispatch({ type: 'repeat' })}
                aria-label={`Repeat: ${state.repeat}`}
                disabled={!current}
              >
                {state.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
              </button>
              <button
                className={videoClip && !player.youTube ? 'active' : ''}
                disabled={!current || !!player.youTube}
                aria-label={
                  player.youTube
                    ? 'YouTube songs always show their video'
                    : videoClip
                      ? 'Hide video clip'
                      : 'Show video clip'
                }
                aria-pressed={videoClip}
                onClick={() => onToggleVideoClip?.()}
              >
                <Film size={21} />
              </button>
              <button
                className={current?.favorite ? 'active' : ''}
                disabled={!current}
                aria-label={
                  current?.favorite ? 'Unfavorite current track' : 'Favorite current track'
                }
                aria-pressed={current?.favorite ?? false}
                onClick={() => {
                  if (current) onFavorite(current);
                }}
              >
                <Heart size={23} fill={current?.favorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="stage-volume">
              <button
                className="icon-button"
                onClick={player.toggleMute}
                aria-label={volume ? 'Mute' : 'Unmute'}
              >
                {volume ? <Volume2 size={21} /> : <VolumeX size={21} />}
              </button>
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
              />
              <span>{Math.round(volume * 100)}%</span>
            </div>
          </div>
          {player.error && (
            <p className="player-state" role="alert">
              {player.error}
            </p>
          )}
        </div>
        {current && (
          <section className="stage-lyrics" data-open={lyricsOpen ? 'true' : 'false'}>
            <button
              className="stage-lyrics-toggle"
              aria-expanded={lyricsOpen}
              aria-controls="now-playing-lyrics"
              onClick={() => onDisclosure?.(!lyricsOpen)}
            >
              <Captions size={19} />
              Lyrics
              <ChevronDown size={18} />
            </button>
            <AnimatePresence initial={false}>
              {lyricsOpen && (
                <motion.div
                  key="lyrics-reader"
                  className="stage-lyrics-reveal"
                  initial={{ opacity: animation.enabled ? 0 : 1, y: animation.enabled ? 10 : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={animation.effects}
                >
                  <LyricsPanel
                    stage
                    readTime={player.readTime}
                    playing={player.state.playing && readerActive}
                    key={current.id}
                    track={current}
                    time={time}
                    onSeek={player.seek}
                    onEdit={() => onLyrics(current)}
                    duration={player.duration}
                    loading={lyricsLoading}
                    automatic={automaticLyrics}
                    onRetry={() => onRetryLyrics?.(current.id)}
                    onOffset={async (lyrics) => onSaveLyrics?.(current.id, lyrics) ?? false}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>
    </>
  );
}

export function PlayerBar(props: PlayerProps) {
  const [lyricsOpen, setLyricsOpen] = useState(true);
  const {
    player,
    expanded,
    onExpanded,
    onOpen,
    returnFocusRef,
    onQueue,
    karaoke = true,
    videoClip = false,
    onToggleVideoClip,
  } = props;
  const idle = useIdleListening(player.state.playing && !player.buffering && !!player.current);
  const showing = expanded || idle.immersive;
  const colors = useArtworkColor(player.state.playing ? player.current?.artwork : undefined);
  const animation = useWaveMotion();
  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => setLyricsOpen(true), 0);
    return () => clearTimeout(timer);
  }, [expanded, player.current?.id]);
  return (
    <>
      <footer
        className="player-bar"
        data-track-id={player.current?.id}
        aria-label="Music player"
        style={player.blend ? undefined : colors}
        inert={showing}
        aria-hidden={showing}
        onClick={(event) => {
          if (!player.current || (event.target as HTMLElement).closest('button,input,a,select'))
            return;
          const opener =
            event.currentTarget.querySelector<HTMLButtonElement>('.compact-title-open');
          if (opener) onOpen(opener);
        }}
      >
        <div className="compact-player">
          <div className="compact-track">
            <button
              className="compact-cover-open"
              aria-label="Expand album artwork"
              disabled={!player.current}
              onClick={(event) => onOpen(event.currentTarget)}
            >
              {player.blend ? (
                <MixVisual blend={player.blend} />
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    className="mini-artwork-transition"
                    key={player.current?.id}
                    initial={
                      animation.enabled ? { opacity: 0, scale: 0.85, rotate: -6 } : { opacity: 1 }
                    }
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: animation.enabled ? 1.12 : 1 }}
                    transition={animation.effects}
                  >
                    <Artwork track={player.current} />
                  </motion.span>
                </AnimatePresence>
              )}
            </button>
            <button
              className="track-info compact-title-open"
              aria-label="Open now playing"
              disabled={!player.current}
              onClick={(event) => onOpen(event.currentTarget)}
            >
              <strong>{player.current?.title ?? 'Nothing playing'}</strong>
              <span className="compact-artist">{player.current?.artist ?? 'Select a song'}</span>
            </button>
          </div>
          <div className="compact-transport">
            <button
              className="mini-previous"
              aria-label="Previous track"
              disabled={!player.current}
              onClick={player.previous}
            >
              <SkipBack size={22} />
            </button>
            <motion.button
              className="mini-play"
              aria-label={player.state.playing ? 'Pause' : 'Play'}
              disabled={!player.current}
              onClick={() => player.dispatch({ type: 'toggle' })}
              whileTap={animation.enabled ? { scale: 0.9 } : undefined}
              animate={{ borderRadius: player.state.playing ? '14px' : '22px' }}
              transition={animation.fast}
            >
              <PlaySymbol playing={player.state.playing} size={25} />
            </motion.button>
            <button
              className="mini-next"
              aria-label="Next track"
              disabled={!player.current}
              onClick={() => player.dispatch({ type: 'next' })}
            >
              <SkipForward size={22} />
            </button>
          </div>
          <div className="compact-seek">
            <WaveSeek
              time={player.time}
              duration={player.duration}
              playing={player.state.playing && !player.buffering}
              onSeek={player.seek}
            />
            <span>
              {formatTime(player.time)} / {formatTime(player.duration)}
            </span>
          </div>
          <div className="compact-modes">
            <button
              aria-label="Shuffle"
              aria-pressed={player.state.shuffled}
              className={player.state.shuffled ? 'active' : ''}
              disabled={!player.current}
              onClick={player.shuffle}
            >
              <Shuffle size={20} />
            </button>
            <button
              aria-label={`Repeat: ${player.state.repeat}`}
              className={player.state.repeat !== 'off' ? 'active' : ''}
              disabled={!player.current}
              onClick={() => player.dispatch({ type: 'repeat' })}
            >
              {player.state.repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </button>
          </div>
          <div className="compact-volume">
            <button
              className="icon-button"
              aria-label={player.volume ? 'Mute' : 'Unmute'}
              onClick={player.toggleMute}
            >
              {player.volume ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <input
              type="range"
              aria-label="Volume"
              min="0"
              max="1"
              step=".01"
              value={player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
          </div>
          <button className="icon-button compact-queue" aria-label="Show queue" onClick={onQueue}>
            <ListMusic size={22} />
          </button>
        </div>
      </footer>

      {showing && (
        <Modal
          title="Now playing"
          fullScreen
          immediate={idle.immersive}
          headerActions={
            <>
              <button
                className={`icon-button ${props.queueOpen ? 'active' : ''}`}
                aria-label="Show queue"
                aria-expanded={props.queueOpen}
                onClick={onQueue}
              >
                <ListMusic size={23} />
              </button>
            </>
          }
          closeIcon={<ChevronDown size={24} />}
          returnFocusRef={expanded ? returnFocusRef : undefined}
          className={`player-modal ${idle.immersive ? 'is-immersive' : ''}`}
          style={player.blend ? undefined : colors}
          onClose={() => {
            idle.wake();
            onExpanded(false);
          }}
        >
          {player.youTube && player.current?.videoId ? (
            // A YouTube song plays through the embed: the video is the source, not
            // a backdrop, so it stays visible whether or not the clip toggle is on.
            <YouTubeStage
              key={player.current.videoId}
              track={player.current}
              playing={player.state.playing}
              volume={player.volume}
              seek={player.youTube.seek}
              onTime={player.youTube.onTime}
              onDuration={player.youTube.onDuration}
              onEnded={player.youTube.onEnded}
              onError={player.youTube.onError}
            />
          ) : (
            videoClip &&
            player.current && (
              <VideoBackdrop
                track={player.current}
                time={player.time}
                duration={player.duration}
                playing={player.state.playing}
                onClose={() => onToggleVideoClip?.()}
              />
            )
          )}
          <MusicLighting className="stage-aura" />
          <div
            data-track-id={player.current?.id}
            className="player-normal-view"
            inert={idle.immersive}
            aria-hidden={idle.immersive}
          >
            <PlayerDetails
              {...props}
              readerActive={!idle.immersive}
              lyricsOpen={lyricsOpen}
              onDisclosure={setLyricsOpen}
            />
          </div>
          {idle.immersive && player.current && (
            <motion.div
              initial={animation.enabled ? { opacity: 0, scale: 0.985 } : { opacity: 1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: animation.enabled ? 0.55 : 0, ease: [0.2, 0, 0, 1] }}
              className={`immersive-stage ${player.current.lyrics?.lines.length ? 'has-lyrics' : 'without-lyrics'}`}
              aria-label="Immersive listening"
            >
              <div className="immersive-art">
                <div className="immersive-title" aria-hidden="true">
                  {player.current.title}
                </div>
                <motion.div
                  key={player.current.id}
                  className="immersive-record-art"
                  initial={animation.enabled ? { opacity: 0, y: 16 } : { opacity: 1 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={animation.expressive}
                >
                  <Artwork track={player.current} className="immersive-cover" />
                </motion.div>
                <div className="immersive-credit">
                  <h2>{player.current.title}</h2>
                  <p>{player.current.artist}</p>
                  <p>{player.current.album}</p>
                </div>
              </div>
              {!!player.current.lyrics?.lines.length && (
                <LyricsPanel
                  stage
                  cinematic
                  karaoke={karaoke}
                  key={player.current.id}
                  track={player.current}
                  time={player.time}
                  readTime={player.readTime}
                  playing={player.state.playing}
                  duration={player.duration}
                  onSeek={player.seek}
                  onEdit={() => {}}
                />
              )}
            </motion.div>
          )}
        </Modal>
      )}
    </>
  );
}
