import { useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { GripVertical, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { Modal } from './Modal';
import { Artwork } from './Artwork';
import { moveId } from '../domain/order';
import type { Track } from '../domain/types';
import { useWaveMotion } from '../ui/motion';
function OrderRow({
  track,
  index,
  count,
  busy,
  onMove,
}: {
  track: Track;
  index: number;
  count: number;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const controls = useDragControls(),
    animation = useWaveMotion();
  return (
    <Reorder.Item
      value={track.id}
      dragListener={false}
      dragControls={controls}
      transition={animation.fast}
      className="reorder-row"
      aria-label={track.title}
    >
      <button
        className="icon-button drag-handle"
        disabled={busy}
        aria-label={`Drag ${track.title} to reorder`}
        onPointerDown={(event) => {
          if (!busy) controls.start(event);
        }}
        onKeyDown={(event) => {
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            if (!busy) onMove(event.key === 'ArrowUp' ? -1 : 1);
          }
        }}
      >
        <GripVertical size={20} />
      </button>
      <Artwork track={track} />
      <span className="track-info">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </span>
      <button
        className="icon-button"
        disabled={busy || index === 0}
        aria-label={`Move ${track.title} up`}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={18} />
      </button>
      <button
        className="icon-button"
        disabled={busy || index === count - 1}
        aria-label={`Move ${track.title} down`}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={18} />
      </button>
    </Reorder.Item>
  );
}
export function ReorderSongs({
  tracks,
  name,
  onSave,
  onClose,
}: {
  tracks: Track[];
  name: string;
  onSave: (ids: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [ids, setIds] = useState(tracks.map((track) => track.id)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Reorder songs" className="reorder-modal" closeDisabled={busy} onClose={onClose}>
      <p className="modal-description">
        {name} · Drag the handle, use the arrow buttons, or press Alt + ↑ / ↓ on a handle. This
        changes collection order, not your current queue or original files.
      </p>
      <Reorder.Group
        axis="y"
        values={ids}
        onReorder={(next) => {
          if (!busy) setIds(next);
        }}
        className="reorder-list"
        layoutScroll
      >
        {ids.map((id, index) => {
          const track = tracks.find((item) => item.id === id);
          return (
            track && (
              <OrderRow
                key={id}
                track={track}
                index={index}
                count={ids.length}
                busy={busy}
                onMove={(direction) => setIds((current) => moveId(current, id, direction))}
              />
            )
          );
        })}
      </Reorder.Group>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="tonal-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="filled-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await onSave(ids)) onClose();
            else
              setError(
                'Order could not be saved. The collection may have changed; reopen it and try again.',
              );
            setBusy(false);
          }}
        >
          <Save size={18} />
          Save order
        </button>
      </div>
    </Modal>
  );
}
