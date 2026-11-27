import { PlayerActionButton } from './PlayerActionButton';
import { useIdleListening } from '../hooks/useIdleListening';
import { IdleStage } from './IdleStage';
import { MusicLighting } from './MusicLighting';
import { VideoBackdrop } from './VideoBackdrop';
import { YouTubeStage } from './YouTubeStage';
import { MixVisual } from './MixVisual';
import { MixCueLabel, MixCueVisual } from './MixCueVisual';
import { SilenceNotice } from './SilenceNotice';
import { BreakPrompt } from './BreakPrompt';
import { cueForTrack, useMixCue, type MixCue } from '../ui/mixCue';
import { WaveSeek } from './WaveSeek';
import { LyricsPanel } from './LyricsPanel';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import type { RefObject } from 'react';
import {
  ChevronDown,
  Captions,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Film,
} from './Glyphs';
import { Heart, VolumeX, PlayPauseGlyph, ListMusic, Volume2 } from './Glyphs';
import { Artwork } from './Artwork';
import { getClip, loadClips } from '../domain/videoClips';
import { Modal } from './Modal';
import { PlayerMorphArtwork } from './PlayerMorphArtwork';
import { PlayerMorphControls } from './PlayerMorphControls';
import { formatTime, type Track } from '../domain/types';
import type { usePlayer } from '../hooks/usePlayer';
import { usePlayerColors } from '../hooks/usePlayerColors';
import { usePlaybackTime } from '../hooks/playbackClock';

import { useT } from '../i18n';
function PlayerLighting({ animated }: { animated: boolean }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="stage-lighting-morph"
      style={{ transformOrigin: '50% 100%' }}
      initial={animated ? { opacity: 0, scaleX: 0.3, scaleY: 0.12 } : false}
      animate={
        present ? { opacity: 1, scaleX: 1, scaleY: 1 } : { opacity: 0, scaleX: 0.3, scaleY: 0.12 }
      }
      transition={{ duration: animated ? 0.48 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <MusicLighting className="stage-aura" />
    </motion.div>
  );
}
type PlayerProps = {
  player: ReturnType<typeof usePlayer>;
  onFavorite: (track: Track) => void;
  expanded: boolean;
  onExpanded: (value: boolean) => void;
  onOpen: (opener: HTMLButtonElement) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  queueOpen: boolean;
  onQueue: () => void;

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
    <motion.span
      className="play-symbol-slot"
      style={{ width: size, height: size }}
      aria-hidden="true"
      animate={
        animation.enabled
          ? { scale: [0.88, 1.08, 1], rotate: playing ? [0, 6, 0] : [0, -6, 0] }
          : { scale: 1, rotate: 0 }
      }
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      key={playing ? 'playing' : 'paused'}
    >
      <PlayPauseGlyph playing={playing} size={size} />
    </motion.span>
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
  const t = useT();
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
            aria-label={state.playing ? t('Pause from artwork') : t('Play from artwork')}
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
            <h3 title={current?.title}>{current?.title ?? t('Nothing playing')}</h3>
            {current ? (
              <div className="stage-metadata">
                <button
                  className="metadata-link"
                  onClick={() => onArtist?.(current.artist)}
                  aria-label={t('Open artist {artist}', { artist: current.artist })}
                >
                  {current.artist}
                </button>
                <button
                  className="metadata-link stage-album"
                  onClick={() => onAlbum?.(current)}
                  aria-label={t('Open album {album}', { album: current.album })}
                >
                  {current.album}
                </button>
              </div>
            ) : (
              <p>{t('Choose a song from your library.')}</p>
            )}
            {}
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
            {player.youTube && player.mixEnabled && (
              <p className="stage-mix-note">
                {t('Mix is not available for YouTube songs yet. They will play normally.')}
              </p>
            )}
            <div className="stage-buttons">
              <button
                className="stage-skip"
                onClick={player.previous}
                aria-label={t('Previous track')}
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
                aria-label={state.playing ? t('Pause') : t('Play')}
                disabled={!current}
              >
                <PlaySymbol playing={state.playing} size={32} />
              </motion.button>
              <button
                className="stage-skip"
                onClick={() => dispatch({ type: 'next' })}
                aria-label={t('Next track')}
                disabled={!current}
              >
                <SkipForward size={27} />
              </button>
            </div>
            <div className="stage-modes">
              <PlayerActionButton
                action="shuffle"
                value={state.shuffled}
                className={state.shuffled ? 'active' : ''}
                onClick={player.shuffle}
                aria-label={t('Shuffle')}
                aria-pressed={state.shuffled}
                disabled={!current}
              >
                <Shuffle size={22} />
              </PlayerActionButton>
              <PlayerActionButton
                action="repeat"
                value={state.repeat}
                className={state.repeat !== 'off' ? 'active' : ''}
                aria-pressed={state.repeat !== 'off'}
                onClick={() => dispatch({ type: 'repeat' })}
                aria-label={t(`Repeat: ${state.repeat}`)}
                disabled={!current}
              >
                <motion.span
                  key={player.repeatSerial}
                  className="repeat-symbol"
                  aria-hidden="true"
                  initial={animation.enabled && player.repeatSerial ? { scale: 0.88 } : false}
                  animate={{ scale: 1 }}
                  transition={animation.effects}
                >
                  {state.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
                </motion.span>
              </PlayerActionButton>
              <PlayerActionButton
                action="clip"
                value={videoClip}
                className={videoClip && !player.youTube ? 'active' : ''}
                disabled={!current || !!player.youTube}
                aria-label={
                  player.youTube
                    ? t('YouTube songs always show their video')
                    : videoClip
                      ? t('Hide video clip')
                      : t('Show video clip')
                }
                aria-pressed={videoClip}
                onClick={() => onToggleVideoClip?.()}
              >
                <Film size={21} />
              </PlayerActionButton>
              <PlayerActionButton
                action="favorite"
                value={current?.favorite}
                className={current?.favorite ? 'active' : ''}
                disabled={!current}
                aria-label={
                  current?.favorite ? t('Unfavorite current track') : t('Favorite current track')
                }
                aria-pressed={current?.favorite ?? false}
                onClick={() => {
                  if (current) onFavorite(current);
                }}
              >
                <Heart size={23} fill={current?.favorite ? 'currentColor' : 'none'} />
              </PlayerActionButton>
            </div>
            <div className="stage-volume">
              <PlayerActionButton
                action="volume"
                value={volume}
                className="icon-button"
                onClick={player.toggleMute}
                aria-label={volume ? t('Mute') : t('Unmute')}
              >
                {volume ? <Volume2 size={21} /> : <VolumeX size={21} />}
              </PlayerActionButton>
              <input
                aria-label={t('Volume')}
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
          <motion.section
            className="stage-lyrics"
            data-open={lyricsOpen ? 'true' : 'false'}
            layout={animation.enabled ? 'position' : false}
            transition={animation.spatial}
          >
            <button
              className="stage-lyrics-toggle"
              aria-expanded={lyricsOpen}
              aria-controls="now-playing-lyrics"
              onClick={() => onDisclosure?.(!lyricsOpen)}
            >
              <Captions size={19} />
              {t('Lyrics')}
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
          </motion.section>
        )}
      </div>
    </>
  );
}

export function PlayerBar(props: PlayerProps) {
  const t = useT();
  const [lyricsOpen, setLyricsOpen] = useState(true);
  const barRef = useRef<HTMLElement>(null);
  const [collapseClip, setCollapseClip] = useState(
    () =>
      `inset(${Math.max(0, (typeof window === 'undefined' ? 800 : window.innerHeight) - 80)}px 20px 16px 20px round 22px)`,
  );
  const {
    player,
    expanded,
    onExpanded,
    onOpen,
    returnFocusRef,
    onQueue,
    videoClip = false,
  } = props;

  const cue = useMixCue(player.mixCue);

  const pending = cueForTrack(cue, player.current?.id);
  const activeMixCue: MixCue | null =
    pending ??
    (player.blend?.from && player.blend?.to
      ? {
          from: player.blend.from,
          to: player.blend.to,
          seconds: Math.max(1, Math.ceil(player.blend.seconds * (1 - player.blend.progress))),
          progress: 1,
        }
      : null);

  const blendTrack = player.blend?.to;
  const blendTo =
    blendTrack &&
    blendTrack.id !== player.current?.id &&
    getClip(blendTrack.id, loadClips()) !== undefined
      ? blendTrack
      : undefined;
  const blendProgress = Math.max(0, Math.min(1, player.blend?.progress ?? 0));
  const blendSeconds = (player.blend?.seconds ?? 0) * blendProgress;
  const idleListening = useIdleListening(
    player.state.playing && !!player.current && !props.queueOpen,
    player.current?.id,
  );
  const idle = idleListening.immersive;
  const showing = expanded || idle;
  useLayoutEffect(() => {
    const measure = () => {
      const bar = barRef.current?.getBoundingClientRect();
      if (bar && bar.width > 0 && bar.height > 0 && window.innerWidth && window.innerHeight) {
        setCollapseClip(
          `inset(${Math.max(0, bar.top)}px ${Math.max(0, window.innerWidth - bar.right)}px ${Math.max(0, window.innerHeight - bar.bottom)}px ${Math.max(0, bar.left)}px round 22px)`,
        );
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    if (barRef.current) observer?.observe(barRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [showing]);

  const time = usePlaybackTime(player.clock);
  const colors = usePlayerColors(
    player.state.playing ? player.current?.artwork : undefined,
    player.blend,
  );
  const animation = useWaveMotion();

  const [stageGone, setStageGone] = useState(true);

  const [clipLive, setClipLive] = useState(false);

  const clipShowing = clipLive && videoClip && showing;
  const stageHasVideo = showing && (clipShowing || !!player.stageYouTubePlayers.length);
  useEffect(() => {
    const root = document.documentElement;
    if (stageHasVideo) root.dataset.clip = 'live';
    else delete root.dataset.clip;
    return () => {
      delete root.dataset.clip;
    };
  }, [stageHasVideo]);
  useEffect(() => {
    if (!expanded || props.queueOpen || !player.current) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, button, a, [role="slider"]'))
      )
        return;
      if (document.querySelectorAll('dialog[open]').length > 1) return;
      switch (event.key) {
        case ' ':
          player.dispatch({ type: 'toggle' });
          break;
        case 'ArrowLeft':
          player.seek(Math.max(0, player.readTime() - 5));
          break;
        case 'ArrowRight':
          player.seek(Math.min(player.duration || Infinity, player.readTime() + 5));
          break;
        case 'ArrowUp':
          player.setVolume(player.volume + 0.05);
          break;
        case 'ArrowDown':
          player.setVolume(player.volume - 0.05);
          break;
        case 'm':
        case 'M':
          player.toggleMute();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, props.queueOpen, player]);
  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => setLyricsOpen(true), 0);
    return () => clearTimeout(timer);
  }, [expanded, player.current?.id]);
  return (
    <>
      <BreakPrompt
        open={player.breakOpen && !showing}
        onContinue={player.keepListening}
        onStop={player.stopForNow}
      />
      {!showing && (
        <SilenceNotice
          key={player.current?.id}
          text={player.silenceNotice?.text ?? null}
          track={player.current ?? undefined}
          onTrim={player.trimSilence}
          onPreview={player.pauseForPreview}
          onRemove={player.removeSilence}
          onKeep={player.keepSilence}
        />
      )}
      <footer
        ref={barRef}
        className="player-bar"
        data-track-id={player.current?.id}
        aria-label={t('Music player')}
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
              aria-label={t('Expand album artwork')}
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
              aria-label={t('Open now playing')}
              disabled={!player.current}
              onClick={(event) => onOpen(event.currentTarget)}
            >
              <strong>{player.current?.title ?? t('Nothing playing')}</strong>
              {}
              <span className="compact-subline">
                <AnimatePresence mode="wait" initial={false}>
                  {activeMixCue ? (
                    <motion.span
                      className="compact-subline-item"
                      key="mixing"
                      initial={animation.enabled ? { opacity: 0, y: 6 } : { opacity: 1 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animation.enabled ? { opacity: 0, y: -6 } : undefined}
                      transition={animation.effects}
                    >
                      <MixCueLabel cue={activeMixCue} />
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
                        {player.current?.artist ?? t('Select a song')}
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
              aria-label={t('Previous track')}
              disabled={!player.current}
              onClick={player.previous}
            >
              <SkipBack size={22} />
            </button>
            <motion.button
              className="mini-play"
              aria-label={player.state.playing ? t('Pause') : t('Play')}
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
              aria-label={t('Next track')}
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
            <PlayerActionButton
              action="shuffle"
              value={player.state.shuffled}
              aria-label={t('Shuffle')}
              aria-pressed={player.state.shuffled}
              className={player.state.shuffled ? 'active' : ''}
              disabled={!player.current}
              onClick={player.shuffle}
            >
              <Shuffle size={20} />
            </PlayerActionButton>
            <PlayerActionButton
              action="repeat"
              value={player.state.repeat}
              aria-label={t(`Repeat: ${player.state.repeat}`)}
              className={player.state.repeat !== 'off' ? 'active' : ''}
              aria-pressed={player.state.repeat !== 'off'}
              disabled={!player.current}
              onClick={() => player.dispatch({ type: 'repeat' })}
            >
              {player.state.repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </PlayerActionButton>
          </div>
          <div className="compact-volume">
            <PlayerActionButton
              action="volume"
              value={player.volume}
              className="icon-button"
              aria-label={player.volume ? t('Mute') : t('Unmute')}
              onClick={player.toggleMute}
            >
              {player.volume ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </PlayerActionButton>
            <input
              type="range"
              aria-label={t('Volume')}
              min="0"
              max="1"
              step=".01"
              value={player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
          </div>
          <button
            className="icon-button compact-queue"
            aria-label={t('Show queue')}
            onClick={onQueue}
          >
            <ListMusic size={22} />
          </button>
        </div>
      </footer>

      {}
      <AnimatePresence initial={false} onExitComplete={() => setStageGone(true)}>
        {showing && (
          <Modal
            title={t('Now playing')}
            fullScreen
            enterMotion={animation.enabled ? { opacity: 1, clipPath: collapseClip } : undefined}
            exitMotion={animation.enabled ? { opacity: 1, clipPath: collapseClip } : undefined}
            exitTransition={
              animation.enabled ? { duration: 0.48, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }
            }
            headerActions={
              <>
                <button
                  className={`icon-button ${props.queueOpen ? 'active' : ''}`}
                  aria-label={t('Show queue')}
                  aria-expanded={props.queueOpen}
                  onClick={onQueue}
                >
                  <ListMusic size={23} />
                </button>
              </>
            }
            closeIcon={<ChevronDown size={24} />}
            returnFocusRef={expanded ? returnFocusRef : undefined}
            className={`player-modal${idle ? ' is-idle is-immersive' : ''}`}
            style={{ ...colors, transformOrigin: '50% 50%' }}
            onClose={() => {
              idleListening.wake();
              setStageGone(false);
              onExpanded(false);
            }}
          >
            <BreakPrompt
              open={player.breakOpen}
              onContinue={player.keepListening}
              onStop={player.stopForNow}
            />
            {player.stageYouTubePlayers.length
              ? player.stageYouTubePlayers.map((item) => (
                  <YouTubeStage
                    key={item.track.id}
                    track={item.track}
                    playing={player.state.playing}
                    volume={player.volume}
                    gain={item.gain}
                    startGain={item.startGain}
                    fadeSeconds={item.fadeSeconds}
                    seek={
                      item.track.id === player.current?.id
                        ? (player.youTube?.seek ?? { seconds: 0, nonce: 0 })
                        : { seconds: 0, nonce: 0 }
                    }
                    startAt={item.track.id === player.current?.id ? time : 0}
                    silent={item.track.id !== player.current?.id}
                    onTime={
                      item.track.id === player.current?.id
                        ? (player.youTube?.onTime ?? (() => {}))
                        : () => {}
                    }
                    onDuration={
                      item.track.id === player.current?.id
                        ? (player.youTube?.onDuration ?? (() => {}))
                        : () => {}
                    }
                    onEnded={
                      item.track.id === player.current?.id
                        ? (player.youTube?.onEnded ?? (() => {}))
                        : () => {}
                    }
                    onError={
                      item.track.id === player.current?.id
                        ? (player.youTube?.onError ?? (() => {}))
                        : () => {}
                    }
                  />
                ))
              : videoClip &&
                player.current && (
                  <>
                    <VideoBackdrop
                      track={player.current}
                      time={time}
                      duration={player.duration}
                      playing={player.state.playing}
                      onRevealed={setClipLive}
                    />
                    {}
                    {blendTo && (
                      <div
                        className="video-backdrop-blend"
                        style={{ '--blend-progress': blendProgress } as CSSProperties}
                      >
                        <VideoBackdrop
                          track={blendTo}
                          time={blendSeconds}
                          duration={blendTo.duration}
                          playing={player.state.playing}
                        />
                      </div>
                    )}
                  </>
                )}
            {}
            <SilenceNotice
              key={player.current?.id}
              className="silence-notice--stage"
              text={player.silenceNotice?.text ?? null}
              track={player.current ?? undefined}
              onTrim={player.trimSilence}
              onPreview={player.pauseForPreview}
              onRemove={player.removeSilence}
              onKeep={player.keepSilence}
            />
            <PlayerLighting animated={animation.enabled} />
            {animation.enabled && !idle && player.current && (
              <>
                {!player.blend && !pending && (
                  <PlayerMorphArtwork barRef={barRef} track={player.current} />
                )}
                <PlayerMorphControls
                  barRef={barRef}
                  playing={player.state.playing}
                  track={player.current}
                  time={time}
                  duration={player.duration}
                  clock={player.clock}
                  shuffled={player.state.shuffled}
                  repeat={player.state.repeat}
                  volume={player.volume}
                />
              </>
            )}
            <div
              data-track-id={player.current?.id}
              className={`player-normal-view${clipShowing ? ' clip-live' : ''}`}
              inert={idle}
              aria-hidden={idle}
            >
              <PlayerDetails
                {...props}
                time={time}
                readerActive={!idle}
                cue={activeMixCue}
                lyricsOpen={lyricsOpen}
                onDisclosure={setLyricsOpen}
              />
            </div>
            <AnimatePresence initial={false}>
              {idle && player.current && (
                <IdleStage
                  key="immersive"
                  track={player.current}
                  time={time}
                  duration={player.duration}
                  hasVideo={stageHasVideo}
                  mixing={!!player.blend || !!activeMixCue}
                  blend={player.blend}
                  pending={pending}
                  mixCue={activeMixCue}
                  animation={animation}
                  readTime={player.readTime}
                  playing={player.state.playing}
                  onSeek={player.seek}
                  onEditLyrics={() => props.onLyrics(player.current!)}
                />
              )}
            </AnimatePresence>
          </Modal>
        )}
      </AnimatePresence>
      {}
      {!showing &&
        stageGone &&
        player.stageYouTubePlayers.map((item) => (
          <YouTubeStage
            key={`silent-${item.track.id}`}
            track={item.track}
            playing={player.state.playing}
            volume={player.volume}
            gain={item.gain}
            startGain={item.startGain}
            fadeSeconds={item.fadeSeconds}
            seek={
              item.track.id === player.current?.id
                ? (player.youTube?.seek ?? { seconds: 0, nonce: 0 })
                : { seconds: 0, nonce: 0 }
            }
            startAt={item.track.id === player.current?.id ? time : 0}
            silent
            onTime={
              item.track.id === player.current?.id
                ? (player.youTube?.onTime ?? (() => {}))
                : () => {}
            }
            onDuration={
              item.track.id === player.current?.id
                ? (player.youTube?.onDuration ?? (() => {}))
                : () => {}
            }
            onEnded={
              item.track.id === player.current?.id
                ? (player.youTube?.onEnded ?? (() => {}))
                : () => {}
            }
            onError={
              item.track.id === player.current?.id
                ? (player.youTube?.onError ?? (() => {}))
                : () => {}
            }
          />
        ))}
    </>
  );
}
