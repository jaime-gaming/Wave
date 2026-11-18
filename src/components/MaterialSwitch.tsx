import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { motion } from 'motion/react';
import { Check } from './Glyphs';
import { useWaveMotion } from '../ui/motion';

const TRACK_TRAVEL_PX = 24;
const DRAG_THRESHOLD_PX = 3;

/**
 * Tactile on/off switch supporting both click and smooth horizontal pointer
 * dragging while keeping a standard pointer cursor (no drag indicator).
 */
export function MaterialSwitch({
  checked,
  onChange,
  label,
  title,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  title?: string;
  disabled?: boolean;
}) {
  const animation = useWaveMotion();
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const stateRef = useRef<{
    pointerId: number;
    startX: number;
    baseProgress: number;
    dragged: boolean;
    progress: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const base = checked ? 1 : 0;
    stateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      baseProgress: base,
      dragged: false,
      progress: base,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic pointer events in tests may not carry an active capture id. */
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = stateRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    if (!active.dragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    active.dragged = true;
    const nextProgress = Math.max(0, Math.min(1, active.baseProgress + dx / TRACK_TRAVEL_PX));
    active.progress = nextProgress;
    setDragProgress(nextProgress);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const active = stateRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    stateRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* Ignore release errors on synthetic events. */
    }
    if (active.dragged) {
      suppressClickRef.current = true;
      setDragProgress(null);
      if (!cancelled) {
        const nextChecked = active.progress >= 0.5;
        if (nextChecked !== checked) onChange(nextChecked);
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    } else {
      setDragProgress(null);
    }
  };

  const isDragging = dragProgress !== null;
  const visualChecked = isDragging ? dragProgress >= 0.5 : checked;

  return (
    <button
      type="button"
      className={`material-switch${isDragging ? ' is-dragging' : ''}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      title={title}
      disabled={disabled}
      style={
        isDragging
          ? ({
              '--switch-drag': dragProgress.toFixed(3),
            } as CSSProperties)
          : undefined
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishDrag(event, false)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (!disabled) onChange(!checked);
      }}
    >
      <motion.span
        initial={false}
        animate={{ x: (dragProgress ?? (checked ? 1 : 0)) * TRACK_TRAVEL_PX }}
        transition={isDragging ? { duration: 0 } : animation.fast}
      >
        {visualChecked && <Check size={15} />}
      </motion.span>
    </button>
  );
}
