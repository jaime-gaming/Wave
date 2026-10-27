import { useEffect, useRef, useState, useMemo } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import {
  ListMusic,
  Plus,
  AudioLines,
  Pause,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react';
import { Artwork } from './Artwork';
import { formatTime, type Track } from '../domain/types';
import type { usePlayer } from '../hooks/usePlayer';
import { useWaveMotion } from '../ui/motion';
import { moveId } from '../domain/order';
function QueueRow({
  track,
  index,
  count,
  editing,
  player,
  onMove,
}: {
  track: Track;
  index: number;
  count: number;
  editing: boolean;
  player: ReturnType<typeof usePlayer>;
  onMove: (direction: -1 | 1) => void;
}) {
  const controls = useDragControls(),
    animation = useWaveMotion(),
    current = track.id === player.current?.id;
  return (
    <Reorder.Item
      value={track.id}
      dragListener={false}
      dragControls={controls}
      layout={animation.enabled ? 'position' : undefined}
      transition={animation.fast}
      className={`queue-entry ${current ? 'current' : ''}`}
      aria-current={current ? 'true' : undefined}
      data-past={index < player.state.index}
      data-track-id={track.id}
    >
      {editing && (
        <button
          className="icon-button queue-drag"
          aria-label={`Drag ${track.title} to reorder`}
          onPointerDown={(e) => controls.start(e)}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              onMove(e.key === 'ArrowUp' ? -1 : 1);
            }
          }}
        >
          <GripVertical size={17} />
        </button>
      )}
      <button
        className="queue-entry__play"
        onClick={() => player.dispatch({ type: 'jump', id: track.id })}
        aria-label={`Play ${track.title} from queue`}
      >
        {!editing && (
          <span className="queue-entry__number" aria-hidden="true">
            {current ? (
              player.state.playing ? (
                <AudioLines size={18} />
              ) : (
                <Pause size={18} />
              )
            ) : (
              index + 1
            )}
          </span>
        )}
        <Artwork track={track} />
        <span className="queue-entry__info">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </span>
        {!editing && <span className="queue-entry__time">{formatTime(track.duration)}</span>}
      </button>
      {editing ? (
        <span className="queue-order-actions">
          <button
            className="icon-button"
            aria-label={`Move ${track.title} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`Move ${track.title} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={16} />
          </button>
        </span>
      ) : (
        <button
          className="icon-button queue-entry__remove"
          onClick={() => player.dispatch({ type: 'remove', id: track.id })}
          aria-label={`Remove ${track.title} from queue`}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </Reorder.Item>
  );
}
export function QueuePanel({
  player,
  tracks,
  onAdd,
}: {
  player: ReturnType<typeof usePlayer>;
  tracks: Track[];
  onAdd: () => void;
}) {
  const list = useRef<HTMLOListElement>(null),
    animation = useWaveMotion();
  const [editing, setEditing] = useState(false),
    [announcement, setAnnouncement] = useState('');
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const queue = useMemo(
    () => player.state.queue.flatMap((id) => byId.get(id) ?? []),
    [player.state.queue, byId],
  );
  const total = queue.reduce((sum, t) => sum + (Number.isFinite(t.duration) ? t.duration : 0), 0);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: animation.enabled ? 'smooth' : 'instant' });
  }, [player.current?.id, animation.enabled]);
  return (
    <aside className="listening-queue" aria-label="Playback queue" data-editing={editing}>
      <div className="listening-queue__summary">
        <span>
          {queue.length} {queue.length === 1 ? 'song' : 'songs'}
          {total > 0 ? ` · ${formatTime(total)}` : ''}
        </span>
        <button
          className="icon-button queue-edit"
          aria-label={editing ? 'Finish reordering queue' : 'Reorder queue'}
          aria-pressed={editing}
          disabled={queue.length < 2 && !editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? <Check size={19} /> : <GripVertical size={19} />}
        </button>
        <button className="tonal-button" onClick={onAdd}>
          <Plus size={18} />
          Add songs to queue
        </button>
      </div>
      {editing && <p className="queue-order-hint">Drag a handle or use the arrows to reorder.</p>}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {!queue.length ? (
        <div className="listening-queue__empty">
          <ListMusic size={40} />
          <h3>Queue is empty</h3>
          <p>Choose the songs you want to hear next.</p>
        </div>
      ) : (
        <Reorder.Group
          as="ol"
          ref={list}
          axis="y"
          layoutScroll
          values={player.state.queue}
          onReorder={(ids) => {
            if (editing) player.reorderQueue(ids);
          }}
          className="queue-list listening-queue__list"
        >
          {queue.map((track, index) => (
            <QueueRow
              key={track.id}
              track={track}
              index={index}
              count={queue.length}
              editing={editing}
              player={player}
              onMove={(direction) => {
                const ids = moveId(player.state.queue, track.id, direction);
                player.reorderQueue(ids);
                setAnnouncement(
                  `${track.title}, position ${ids.indexOf(track.id) + 1} of ${ids.length}`,
                );
              }}
            />
          ))}
        </Reorder.Group>
      )}
    </aside>
  );
}
