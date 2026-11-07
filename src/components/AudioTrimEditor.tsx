import { useEffect, useRef, useState } from 'react';
import type { Track } from '../domain/types';
import { formatTime } from '../domain/types';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { Play, Pause } from './Glyphs';
import { MAX_ANALYSIS_BYTES, MAX_ANALYSIS_SECONDS } from '../audio/mixAnalysis';

/** Playback bounds only: the source file is never rewritten. */
export function AudioTrimEditor({
  track,
  onChange,
  value,
  onPreview,
  volume = 1,
}: {
  onPreview?: () => void;
  volume?: number;
  value?: { start: number; end: number } | null;
  track: Track;
  onChange: (bounds: { start: number; end: number }) => void;
}) {
  const previewOwner = useRef(onPreview);
  useEffect(() => {
    if (track.blob && track.duration) previewOwner.current?.();
  }, [track.blob, track.duration]);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [start, setStart] = useState(
    value?.start ?? track.trim?.start ?? Math.max(0, (track.silence?.start ?? 0) - 0.25),
  );
  const [end, setEnd] = useState(
    value?.end ??
      track.trim?.end ??
      Math.min(track.duration, (track.silence?.end ?? track.duration) + 0.25),
  );
  const animation = useWaveMotion();
  const [zoom, setZoom] = useState<'start' | 'end' | null>(null);
  const [zoomStart, setZoomStart] = useState(0);
  const boundsRef = useRef({ start, end });
  useEffect(() => {
    boundsRef.current = { start, end };
  }, [start, end]);
  const [playing, setPlaying] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    edge: 'start' | 'end';
    x: number;
    timer: ReturnType<typeof setTimeout>;
    zoomed: boolean;
  } | null>(null);
  useEffect(
    () => () => {
      if (drag.current) clearTimeout(drag.current.timer);
    },
    [],
  );
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (audio.current)
      audio.current.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
  }, [volume]);
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);
  useEffect(() => {
    if (!track.blob) return;
    const objectUrl = URL.createObjectURL(track.blob);
    const element = audio.current;
    if (element) element.src = objectUrl;
    let cancelled = false;
    const tooLarge = track.blob.size > MAX_ANALYSIS_BYTES || track.duration > MAX_ANALYSIS_SECONDS;
    const context = !tooLarge && typeof AudioContext !== 'undefined' ? new AudioContext() : null;
    if (context)
      void track.blob
        .arrayBuffer()
        .then((bytes) => context.decodeAudioData(bytes))
        .then((buffer) => {
          if (cancelled) return;
          const result = Array.from({ length: 240 }, (_, i) => {
            let peak = 0;
            const from = Math.floor((i * buffer.length) / 240);
            const to = Math.floor(((i + 1) * buffer.length) / 240);
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              const samples = buffer.getChannelData(ch);
              for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(samples[j]));
            }
            return peak;
          });
          // Display-relative amplitude makes quiet recordings legible without
          // changing playback level or the silence decision.
          const maximum = Math.max(...result, 0.00001);
          setPeaks(result.map((value) => value / maximum));
        })
        .catch(() => {
          if (!cancelled) setUnavailable(true);
        })
        .finally(() => {
          void context.close().catch(() => {});
        });
    else
      queueMicrotask(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
      element?.pause();
      element?.removeAttribute('src');
      element?.load();
      URL.revokeObjectURL(objectUrl);
      void context?.close().catch(() => {});
    };
  }, [track.blob, track.duration]);
  if (!track.blob || !track.duration) return null;
  const change = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    const nextStart = Math.max(0, Math.min(a, track.duration - 0.1));
    const nextEnd = Math.min(track.duration, Math.max(nextStart + 0.1, b));
    setStart(nextStart);
    setEnd(nextEnd);
    onChange({ start: nextStart, end: nextEnd });
  };
  const preview = (from: number, to: number) => {
    if (!audio.current) return;
    onPreview?.();
    audio.current.currentTime = from;
    setPreviewEnd(to);
    void audio.current.play().catch(() => setUnavailable(true));
  };
  const duration = track.duration;
  const zoomWindow = Math.min(duration, Math.max(30, duration * 0.4));
  const windowSize = zoom ? zoomWindow : duration;
  const windowStart = zoom ? zoomStart : 0;
  const position = (seconds: number) =>
    Math.max(0, Math.min(100, ((seconds - windowStart) / windowSize) * 100));
  const finish = () => {
    if (drag.current) clearTimeout(drag.current.timer);
    drag.current = null;
    setZoom(null);
  };
  return (
    <section className="audio-trim-editor" aria-label="Trim audio">
      <div className="trim-heading">
        <h3>Keep the part you love</h3>
        <span>{formatTime(end - start)}</span>
      </div>
      <p>Slide the edges to leave the quiet parts behind. Hold an edge to zoom in.</p>
      <div className={`trim-wave-rail${zoom ? ' is-zoomed' : ''}`} ref={rail}>
        <motion.svg
          role="img"
          aria-label="Audio waveform; highlighted region will be kept"
          preserveAspectRatio="none"
          initial={false}
          animate={{
            opacity: 1,
            viewBox: `${(windowStart / duration) * 480} 0 ${(windowSize / duration) * 480} 90`,
          }}
          transition={animation.fast}
        >
          <rect
            x={(start / duration) * 480}
            width={((end - start) / duration) * 480}
            y="0"
            height="90"
            fill="currentColor"
            opacity="0.16"
          />
          {peaks.map((peak, i) => (
            <line
              key={i}
              x1={i * 2}
              x2={i * 2}
              y1={45 - peak * 43}
              y2={45 + peak * 43}
              stroke="currentColor"
              strokeWidth="1"
              opacity={(i / 240) * duration < start || (i / 240) * duration > end ? 0.2 : 1}
            />
          ))}
        </motion.svg>
        {(['start', 'end'] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            role="slider"
            className={`trim-handle trim-handle-${edge}`}
            aria-label={`Trim ${edge}`}
            aria-valuemin={edge === 'start' ? 0 : start + 0.1}
            aria-valuemax={edge === 'start' ? end - 0.1 : duration}
            aria-valuenow={edge === 'start' ? start : end}
            aria-valuetext={formatTime(edge === 'start' ? start : end)}
            style={{ left: `${position(edge === 'start' ? start : end)}%` }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const timer = setTimeout(() => {
                if (drag.current) {
                  drag.current.zoomed = true;
                  setZoomStart(
                    Math.max(
                      0,
                      Math.min(duration - zoomWindow, boundsRef.current[edge] - zoomWindow / 2),
                    ),
                  );
                  setZoom(edge);
                }
              }, 450);
              drag.current = { edge, x: event.clientX, timer, zoomed: false };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (!active || active.edge !== edge || !rail.current) return;
              const delta =
                ((event.clientX - active.x) / rail.current.getBoundingClientRect().width) *
                (active.zoomed ? zoomWindow : duration);
              active.x = event.clientX;
              if (edge === 'start') change(Math.min(end - 0.1, start + delta), end);
              else change(start, end + delta);
            }}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 1;
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const current = edge === 'start' ? start : end;
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? duration
                    : current + (event.key === 'ArrowLeft' ? -step : step);
              if (edge === 'start') change(Math.min(end - 0.1, next), end);
              else change(start, next);
            }}
          >
            <span />
            <span />
          </button>
        ))}
      </div>
      <div className="trim-time-labels">
        <span>{formatTime(start)}</span>
        <span aria-live="polite">
          {zoom ? 'Fine adjustment · release to zoom out' : 'Your original file stays untouched'}
        </span>
        <span>{formatTime(end)}</span>
      </div>
      {!peaks.length && (
        <small role="status">
          {unavailable
            ? 'Waveform unavailable. You can still preview and adjust the edges.'
            : 'Drawing your waveform…'}
        </small>
      )}
      <div className="trim-preview-actions">
        {start > 0 && (
          <button type="button" className="tonal-button" onClick={() => preview(0, start)}>
            Listen to intro
          </button>
        )}
        <button
          type="button"
          className="filled-button"
          onClick={() => {
            if (playing) audio.current?.pause();
            else preview(start, end);
          }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
          {playing ? 'Pause preview' : 'Listen to selection'}
        </button>
        {end < duration && (
          <button type="button" className="tonal-button" onClick={() => preview(end, duration)}>
            Listen to ending
          </button>
        )}
        <button type="button" className="text-button" onClick={() => change(0, duration)}>
          Keep everything
        </button>
      </div>
      <audio
        ref={audio}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => {
          if (audio.current && previewEnd !== null && audio.current.currentTime >= previewEnd)
            audio.current.pause();
        }}
      />
    </section>
  );
}
