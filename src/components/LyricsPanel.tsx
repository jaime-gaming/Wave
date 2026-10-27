import { canLookup } from '../domain/lyricsLookup';
import { memo, useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Captions,
  SlidersHorizontal,
  RotateCcw,
  FileText,
  LocateFixed,
  Pencil,
  Download,
  RefreshCw,
  WifiOff,
  Minus,
  Plus,
  Music2,
} from 'lucide-react';
import {
  activeLyricIndex,
  lyricFillProgress,
  lyricFillTokens,
  timedWordProgress,
  type Lyrics,
  type LyricLine,
} from '../domain/lyrics';
import { karaokeWords, wordProgress } from '../domain/wordTiming';
import type { Track } from '../domain/types';
import { useWaveMotion } from '../ui/motion';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
const LyricRow = memo(function LyricRow({
  readOnly = false,
  line,
  active,
  passed,
  progress,
  onSeek,
  seconds = 0,
  offsetMs = 0,
  nextLine,
  duration,
  karaoke = true,
}: {
  seconds?: number;
  offsetMs?: number;
  nextLine?: number;
  duration?: number;
  karaoke?: boolean;
  readOnly?: boolean;
  line: LyricLine;
  active: boolean;
  passed: boolean;
  progress: number;
  onSeek: (time: number) => void;
}) {
  const animation = useWaveMotion();
  const tokens = useMemo(() => lyricFillTokens(line.text || '♪'), [line.text]);
  const wordTokens = line.words?.map((word) => ({
    ...word,
    fill: timedWordProgress(word, seconds, offsetMs, nextLine, duration),
  }));
  // Word-by-word timing: provider timestamps when the file has them, otherwise
  // a deterministic estimate derived from the line window.
  const karaokeTokens = useMemo(() => {
    if (!karaoke || line.time === undefined) return null;
    const words = karaokeWords(line, nextLine, duration);
    if (!words.length) return null;
    const clock = seconds - offsetMs / 1000;
    return words.map((word) => ({
      text: word.text,
      start: word.start,
      end: word.end,
      source: word.source,
      fill: wordProgress(word, clock),
    }));
  }, [karaoke, line, nextLine, duration, seconds, offsetMs]);
  const Row = readOnly ? motion.p : motion.button;
  return (
    <Row
      className={`lyric-line ${active ? 'active' : ''}`}
      title={readOnly ? undefined : line.text}
      data-active={active}
      aria-current={active ? 'true' : undefined}
      aria-label={
        readOnly ? line.text || 'Instrumental' : `Seek to lyric: ${line.text || 'Instrumental'}`
      }
      onClick={readOnly ? undefined : () => onSeek(line.time!)}
      animate={
        animation.enabled
          ? {
              opacity: active ? 1 : passed ? 0.6 : 0.76,
              x: active ? 8 : 0,
              scale: active ? 1 : 0.97,
            }
          : { opacity: 1, x: 0, scale: 1 }
      }
      transition={animation.fast}
    >
      <span
        className="lyric-text"
        aria-hidden="true"
        data-fill={active ? progress : passed ? 1 : 0}
      >
        {(karaokeTokens ?? wordTokens ?? tokens).map((token, i) => {
          const fill = passed
            ? 1
            : 'fill' in token
              ? token.fill
              : Math.max(
                  0,
                  Math.min(
                    1,
                    (progress - (token as (typeof tokens)[number]).start) /
                      ((token as (typeof tokens)[number]).end -
                        (token as (typeof tokens)[number]).start),
                  ),
                );
          return /^\s+$/u.test(token.text) ? (
            token.text
          ) : (
            <span
              key={i}
              className="lyric-word"
              data-word-fill={fill}
              data-word-source={
                'source' in token ? (token as { source: string }).source : undefined
              }
              style={{
                backgroundImage: `linear-gradient(90deg, var(--player-ink) ${fill * 100}%, var(--player-muted) ${fill * 100}%)`,
              }}
            >
              {token.text}
            </span>
          );
        })}
      </span>
    </Row>
  );
});
export function LyricsPanel({
  track,
  time: reportedTime,
  readTime,
  playing = false,
  duration,
  onSeek,
  onEdit,
  loading = false,
  automatic = true,
  onRetry,
  onOffset,
  stage = false,
  cinematic = false,
  karaoke = true,
}: {
  readTime?: () => number;
  playing?: boolean;
  stage?: boolean;
  cinematic?: boolean;
  /** Word-by-word highlighting; estimated timings are labelled as such. */
  karaoke?: boolean;
  track: Track;
  time: number;
  duration?: number;
  onSeek: (time: number) => void;
  onEdit: () => void;
  loading?: boolean;
  automatic?: boolean;
  onRetry?: () => void;
  onOffset?: (lyrics: Lyrics) => Promise<boolean>;
}) {
  const [nativeTime, setNativeTime] = useState(reportedTime);
  useEffect(() => {
    if (!playing || !readTime) return;
    let frame = 0,
      last = 0;
    const sample = (now: number) => {
      if (!document.hidden && now - last >= 32) {
        setNativeTime(readTime());
        last = now;
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [readTime, playing]);
  const time = playing && readTime ? nativeTime : reportedTime;
  const pane = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true),
    [adjusting, setAdjusting] = useState(false);
  const [pageStart, setPageStart] = useState(0);
  const animation = useWaveMotion();
  const lyrics = track.lyrics,
    index = lyrics ? activeLyricIndex(lyrics, time) : -1,
    activeTime = index >= 0 ? lyrics?.lines[index].time : undefined;
  const [windowCount, setWindowCount] = useState(3);
  useEffect(() => {
    const el = pane.current;
    if (!stage || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setWindowCount(cinematic ? 3 : h >= 280 ? 3 : h >= 160 ? 2 : 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stage, lyrics?.raw, cinematic]);
  const synchronized = lyrics?.lines[0]?.time !== undefined;
  const windowStart =
    follow && synchronized
      ? Math.min(
          Math.max(0, index - Math.floor(windowCount / 2)),
          Math.max(0, (lyrics?.lines.length ?? 0) - windowCount),
        )
      : pageStart;
  const lineProgress = lyrics ? lyricFillProgress(lyrics, time, duration) : 0;
  const browsePage = (direction: number) => {
    if (!lyrics) return;
    const next = Math.max(
      0,
      Math.min(
        lyrics.lines.length - 1,
        (follow ? windowStart : pageStart) + direction * windowCount,
      ),
    );
    setFollow(false);
    setPageStart(next);
    const el = pane.current,
      row = el?.querySelectorAll<HTMLElement>('.lyric-line')[next];
    if (el && row)
      el.scrollTo({
        top: row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2,
        behavior: animation.enabled ? 'smooth' : 'instant',
      });
  };
  const seek = useCallback(
    (seconds: number) => {
      onSeek(Math.max(0, seconds + (lyrics?.offsetMs ?? 0) / 1000));
      setFollow(true);
    },
    [onSeek, lyrics?.offsetMs],
  );
  useLayoutEffect(() => {
    const el = pane.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = (smooth: boolean) => {
      for (const previous of el.querySelectorAll<HTMLElement>('[data-fitted]')) {
        previous.style.removeProperty('font-size');
        delete previous.dataset.fitted;
      }
      const line = el.querySelector<HTMLElement>('.lyric-line.active');
      if (!line) return;
      const max = Number.parseFloat(getComputedStyle(line).fontSize),
        budget = el.clientHeight * (cinematic ? 0.68 : 0.9);
      if (line.scrollHeight > budget) {
        let low = 12,
          high = Math.floor(max);
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          line.style.fontSize = middle + 'px';
          if (line.scrollHeight <= budget) low = middle;
          else high = middle - 1;
        }
        line.style.fontSize = low + 'px';
        line.dataset.fitted = 'true';
      }
      if (!cinematic && follow)
        el.scrollTo({
          top: line.offsetTop - el.clientHeight / 2 + line.clientHeight / 2,
          behavior: smooth && animation.enabled ? 'smooth' : 'instant',
        });
    };
    const observer = new ResizeObserver(() => fit(false));
    observer.observe(el);
    fit(true);
    return () => observer.disconnect();
  }, [
    cinematic,
    activeTime,
    lyrics?.raw,
    lyrics?.offsetMs,
    follow,
    animation.enabled,
    windowCount,
  ]);
  const [timingError, setTimingError] = useState('');
  const adjustOffset = async (delta: number) => {
    if (!lyrics || !onOffset || adjusting) return;
    setAdjusting(true);
    setTimingError('');
    try {
      const saved = await onOffset({
        ...lyrics,
        offsetMs: Math.max(-10000, Math.min(10000, lyrics.offsetMs + delta)),
      });
      if (saved) setFollow(true);
      else setTimingError('Could not save timing. Try again.');
    } catch {
      setTimingError('Could not save timing. Try again.');
    } finally {
      setAdjusting(false);
    }
  };
  const online = useOnline();
  const retryAt = track.lyricsLookup?.retryAt ?? 0;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const status = track.lyricsLookup?.status;
  return (
    <motion.section
      id={cinematic ? undefined : stage ? 'now-playing-lyrics' : undefined}
      className={`lyrics-panel ${stage ? 'lyrics-stage' : ''} ${cinematic ? 'lyrics-cinematic' : ''}`}
      aria-label="Song lyrics"
      initial={animation.enabled ? { opacity: 0, y: 20, scale: 0.97 } : { opacity: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={animation.expressive}
    >
      {!cinematic && !stage && (
        <div className="lyrics-heading">
          <h3>
            <Captions size={22} />
            Lyrics
          </h3>
          <button className="icon-button" aria-label="Edit lyrics" onClick={onEdit}>
            <Pencil size={20} />
          </button>
        </div>
      )}
      {lyrics?.lines.length ? (
        <>
          {!cinematic && (
            <div
              className="lyrics-caption lyrics-provenance"
              title={
                synchronized
                  ? lyrics.lines.some((line) => line.words?.length)
                    ? 'Text fill uses supplied word timestamps; untimed lines interpolate line intervals.'
                    : 'Text fill interpolates line intervals, not exact word timing.'
                  : undefined
              }
            >
              <span>
                <span className={synchronized ? 'sr-only' : undefined}>
                  {synchronized ? 'Synchronized lyrics · tap a line to seek' : 'Text lyrics'}
                </span>
              </span>
              {lyrics.source !== 'local' && lyrics.source !== 'embedded' && (
                <a
                  href={
                    lyrics.source === 'lrclib'
                      ? lyrics.providerId
                        ? `https://lrclib.net/lyrics/${lyrics.providerId}`
                        : 'https://lrclib.net'
                      : lyrics.source === 'netease'
                        ? 'https://music.163.com'
                        : 'https://www.kugou.com'
                  }
                  target="_blank"
                  rel="noreferrer"
                  title={
                    lyrics.source === 'lrclib'
                      ? 'Lyrics from LRCLIB'
                      : `Lyrics from ${lyrics.provider ?? lyrics.source}, opt-in source`
                  }
                >
                  {lyrics.source === 'lrclib' ? 'LRCLIB' : (lyrics.provider ?? lyrics.source)}
                </a>
              )}
            </div>
          )}
          <div
            ref={pane}
            className="lyrics-scroll"
            onWheel={() => setFollow(false)}
            onTouchMove={() => setFollow(false)}
          >
            {lyrics.lines.map((line, i) =>
              cinematic &&
              (i < windowStart || i >= windowStart + windowCount) ? null : line.time !==
                undefined ? (
                <LyricRow
                  readOnly={cinematic}
                  key={i}
                  line={line}
                  active={activeTime !== undefined && line.time === activeTime}
                  passed={activeTime !== undefined && line.time < activeTime}
                  progress={line.time === activeTime ? lineProgress : 0}
                  onSeek={seek}
                  seconds={line.time === activeTime ? time : 0}
                  offsetMs={lyrics.offsetMs}
                  nextLine={lyrics.lines.slice(i + 1).find((next) => next.time! > line.time!)?.time}
                  duration={duration}
                  karaoke={karaoke}
                />
              ) : (
                <p
                  key={i}
                  className={`lyric-line plain ${cinematic && i === windowStart ? 'active' : ''}`}
                >
                  <span className="lyric-text">{line.text}</span>
                </p>
              ),
            )}
          </div>
          {!cinematic && (
            <div className="lyrics-tools">
              {stage && (
                <button className="icon-button" aria-label="Edit lyrics" onClick={onEdit}>
                  <Pencil size={18} />
                </button>
              )}
              {stage && lyrics.lines.length > windowCount && (
                <div className="lyrics-pages">
                  <button
                    className="icon-button"
                    aria-label="Previous lyric lines"
                    onClick={() => browsePage(-1)}
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next lyric lines"
                    onClick={() => browsePage(1)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}
              {synchronized && (
                <button
                  className="text-button"
                  aria-pressed={follow}
                  onClick={() => setFollow((value) => !value)}
                >
                  <LocateFixed size={18} />
                  <span className="sr-only">
                    {follow ? 'Following playback' : 'Follow playback'}
                  </span>
                </button>
              )}
              {synchronized && onOffset && (
                <details className="lyrics-timing">
                  <summary aria-label="Adjust lyric timing" title="Adjust lyric timing">
                    <SlidersHorizontal size={18} />
                  </summary>
                  <div className="lyrics-offset" aria-label="Lyric timing adjustment">
                    <button
                      className="icon-button"
                      aria-label="Show lyrics 100 milliseconds earlier"
                      disabled={adjusting || lyrics.offsetMs <= -10000}
                      onClick={() => void adjustOffset(-100)}
                    >
                      <Minus size={16} />
                    </button>
                    <span aria-live="polite" aria-atomic="true">
                      {lyrics.offsetMs > 0 ? '+' : ''}
                      {lyrics.offsetMs} ms
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Show lyrics 100 milliseconds later"
                      disabled={adjusting || lyrics.offsetMs >= 10000}
                      onClick={() => void adjustOffset(100)}
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Reset lyric timing"
                      title="Reset lyric timing"
                      disabled={adjusting || lyrics.offsetMs === 0}
                      onClick={() => void adjustOffset(-lyrics.offsetMs)}
                    >
                      <RotateCcw size={16} />
                    </button>
                    {timingError && (
                      <p className="lyrics-timing-error" role="alert">
                        {timingError}
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="lyrics-empty">
          <motion.div
            className="lyrics-empty-symbol"
            animate={
              animation.enabled && loading
                ? { rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }
                : { rotate: 0, scale: 1 }
            }
            transition={loading ? { duration: 1.8, repeat: Infinity } : animation.fast}
          >
            {loading ? (
              <Download size={40} />
            ) : status === 'instrumental' ? (
              <Music2 size={40} />
            ) : status === 'error' ? (
              <WifiOff size={40} />
            ) : (
              <FileText size={40} />
            )}
          </motion.div>
          <h3>
            {!online
              ? 'No connection'
              : cooldown
                ? 'Taking a breath'
                : loading
                  ? 'Looking for lyrics'
                  : status === 'instrumental'
                    ? 'Instrumental'
                    : 'No lyrics yet'}
          </h3>
          <p>
            {!online
              ? 'Lyrics search needs a connection. Anything already saved still shows.'
              : cooldown
                ? `The provider asked for a pause. Try again in ${cooldown} s.`
                : loading
                  ? 'Searching for this song.'
                  : status === 'instrumental'
                    ? 'This song is marked instrumental.'
                    : status === 'error'
                      ? 'The lyrics service did not answer.'
                      : 'Nothing matched this song.'}
          </p>
          <span>
            {automatic
              ? !canLookup(track)
                ? 'Add a title and artist in the song details to search for lyrics.'
                : 'You can add your own lyrics if nothing matches.'
              : 'Searching online sends the title and artist to LRCLIB, never your audio. You can also add an LRC file.'}
          </span>
          {!cinematic && (
            <div className="lyrics-empty-actions">
              {onRetry && (
                <button
                  className="tonal-button"
                  disabled={loading || cooldown > 0 || !canLookup(track) || !online}
                  aria-label={networkAriaLabel(online, 'Search again')}
                  onClick={onRetry}
                >
                  <RefreshCw size={17} />
                  {networkLabel(online, 'Search again')}
                </button>
              )}
              <button className="text-button" onClick={onEdit}>
                Add lyrics
              </button>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
