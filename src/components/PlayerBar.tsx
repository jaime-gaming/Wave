import { MusicLighting } from './MusicLighting';
import { VideoBackdrop } from './VideoBackdrop';
import { YouTubeStage } from './YouTubeStage';
import { MixVisual } from './MixVisual';
import { MixCueLabel, MixCueVisual } from './MixCueVisual';
import { cueForTrack, useMixCue, type MixCue } from '../ui/mixCue';
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
import { usePlayerColors } from '../hooks/usePlayerColors';
import { usePlaybackTime } from '../hooks/playbackClock';

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
  time,
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
  cue = null,
}: PlayerProps & { readerActive?: boolean; time: number; cue?: MixCue | null }) {
  const { current, state, duration, volume, dispatch } = player;
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
            ) : cue ? (
              <MixCueVisual cue={cue} artworkClassName="stage-artwork" />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {' '}
                <motion.div
                  className="stage-cover-transition"
                  key={`${current?.id ?? 'empty'}:${current?.editedAt ?? 0}`}
                  initial={{
                    opacity: animation.enabled ? 0 : 1,
                    scale: animation.enabled ? 0.94 : 1,
                    y: animation.enabled ? 18 : 0,
                    rotate: animation.enabled ? -1.5 : 0,
                    filter: animation.enabled ? 'blur(10px)' : 'blur(0px)',
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0, rotate: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: animation.enabled ? 1.03 : 1 }}
                  transition={{ ...animation.cinematic, opacity: animation.reveal }}
                >
                  <Artwork track={current} className="stage-artwork" />
                </motion.div>
              </AnimatePresence>
            )}
          </button>
          <motion.div
            className="stage-track"
            key={current?.id}
            initial={
              animation.enabled ? { opacity: 0, y: 12, filter: 'blur(4px)' } : { opacity: 1 }
            }
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ ...animation.reveal, delay: animation.enabled ? 0.06 : 0 }}
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
            {/*
              The cue shares the line under the title with the artist, and the
              block around it is what has to move: a word that appears and
              disappears without the text around it reflowing leaves a gap that
              snaps shut. The height is animated with the fade, so the title,
              the artist and the words all settle together.
            */}
            <AnimatePresence initial={false}>
              {cue && (
                <motion.div
                  className="stage-cue"
                  key="stage-cue"
                  initial={animation.enabled ? { opacity: 0, height: 0, y: 4 } : false}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={animation.enabled ? { opacity: 0, height: 0, y: -2 } : undefined}
                  transition={animation.effects}
                >
                  <MixCueLabel cue={cue} />
                </motion.div>
              )}
            </AnimatePresence>
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
    videoClip = false,
  } = props;
  // The cue belongs to the song that is playing; a stale one is never drawn.
  const cue = useMixCue(player.mixCue);
  // Either side of the cue can be the song that is playing: the cue arrives
  // while the outgoing song is still on, and by the time the two meet the
  // interface has already moved on to the incoming one.
  const pending = cueForTrack(cue, player.current?.id);
  // The player opens when it is asked to. It used to take the screen over after
  // thirty seconds of listening without a click; that scene is gone, so an idle
  // room now stays exactly as the listener left it.
  const showing = expanded;
  // Only this bar follows the position; the rest of the interface stays still.
  const time = usePlaybackTime(player.clock);
  const colors = usePlayerColors(
    player.state.playing ? player.current?.artwork : undefined,
    player.blend,
  );
  const animation = useWaveMotion();
  // While the player is leaving, the silent YouTube host must not mount yet: two
  // embeds of the same song would both be playing through the collapse. Closing
  // turns it off; the end of the collapse turns it back on.
  const [stageGone, setStageGone] = useState(true);
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
        style={colors}
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
              ) : pending ? (
                <MixCueVisual cue={pending} />
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
              {/*
                One line, two states: the artist normally, "Mixing" while the
                next song is being announced. Swapping the text in place made
                the bar jump a pixel and read as a glitch, so the line hands over
                instead — the old text leaves downwards, the new one arrives
                from below it.
              */}
              <span className="compact-subline">
                <AnimatePresence mode="wait" initial={false}>
                  {pending ? (
                    <motion.span
                      className="compact-subline-item"
                      key="mixing"
                      initial={animation.enabled ? { opacity: 0, y: 6 } : { opacity: 1 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animation.enabled ? { opacity: 0, y: -6 } : undefined}
                      transition={animation.effects}
                    >
                      <MixCueLabel cue={pending} />
                    </motion.span>
                  ) : (
                    <motion.span
                      className="compact-subline-item"
                      key={`artist:${player.current?.id ?? 'none'}`}
                      initial={animation.enabled ? { opacity: 0, y: 6 } : { opacity: 1 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animation.enabled ? { opacity: 0, y: -6 } : undefined}
                      transition={animation.effects}
                    >
                      <span className="compact-artist">
                        {player.current?.artist ?? 'Select a song'}
                      </span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
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
              time={time}
              duration={player.duration}
              playing={player.state.playing && !player.buffering}
              onSeek={player.seek}
            />
            <span>
              {formatTime(time)} / {formatTime(player.duration)}
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

      {/* The expanded player leaves as an object rather than vanishing: it
          scales back down towards the bar it came from and fades with it. */}
      <AnimatePresence initial={false} onExitComplete={() => setStageGone(true)}>
        {showing && (
          <Modal
            title="Now playing"
            fullScreen
            // Closing folds the player back down into the bar it came from: it
            // slides towards the bottom, tightens a little, and is gone before the
            // movement ends, so there is no ghost hanging in the middle.
            exitMotion={
              animation.enabled
                ? { opacity: 0, scale: 0.9, y: 64, transitionEnd: { display: 'none' } }
                : undefined
            }
            exitTransition={
              animation.enabled
                ? {
                    duration: 0.3,
                    ease: [0.32, 0, 0.24, 1],
                    opacity: { duration: 0.18, ease: 'easeOut' },
                  }
                : { duration: 0 }
            }
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
            className="player-modal"
            style={{ ...colors, transformOrigin: 'bottom center' }}
            onClose={() => {
              setStageGone(false);
              onExpanded(false);
            }}
          >
            {player.stageYouTube ? (
              // A YouTube song plays through the embed: the video is the source, not
              // a backdrop, so it stays visible whether or not the clip toggle is on.
              <YouTubeStage
                key={player.stageYouTube.track.videoId}
                track={player.stageYouTube.track}
                playing={player.state.playing}
                volume={player.volume}
                gain={player.stageYouTube.gain}
                startGain={player.stageYouTube.startGain}
                fadeSeconds={player.stageYouTube.fadeSeconds}
                seek={player.youTube?.seek ?? { seconds: 0, nonce: 0 }}
                startAt={time}
                onTime={player.youTube?.onTime ?? (() => {})}
                onDuration={player.youTube?.onDuration ?? (() => {})}
                onEnded={player.youTube?.onEnded ?? (() => {})}
                onError={player.youTube?.onError ?? (() => {})}
              />
            ) : (
              videoClip &&
              player.current && (
                <VideoBackdrop
                  track={player.current}
                  time={time}
                  duration={player.duration}
                  playing={player.state.playing}
                />
              )
            )}
            <MusicLighting className="stage-aura" />
            <div data-track-id={player.current?.id} className="player-normal-view">
              <PlayerDetails
                {...props}
                time={time}
                cue={pending}
                lyricsOpen={lyricsOpen}
                onDisclosure={setLyricsOpen}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>
      {/*
        A YouTube song keeps playing while Now Playing is collapsed, so the embed
        stays mounted in a one-pixel host. Expanding mounts the visible player from
        the same position; the song never restarts because of a layout change.
      */}
      {!showing && stageGone && player.stageYouTube && (
        <YouTubeStage
          key={`silent-${player.stageYouTube.track.videoId}`}
          track={player.stageYouTube.track}
          playing={player.state.playing}
          volume={player.volume}
          gain={player.stageYouTube.gain}
          startGain={player.stageYouTube.startGain}
          fadeSeconds={player.stageYouTube.fadeSeconds}
          seek={player.youTube?.seek ?? { seconds: 0, nonce: 0 }}
          startAt={time}
          silent
          onTime={player.youTube?.onTime ?? (() => {})}
          onDuration={player.youTube?.onDuration ?? (() => {})}
          onEnded={player.youTube?.onEnded ?? (() => {})}
          onError={player.youTube?.onError ?? (() => {})}
        />
      )}
    </>
  );
}
