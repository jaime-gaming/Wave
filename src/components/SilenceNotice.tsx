import { useState } from 'react';
import { Modal } from './Modal';
import { AudioTrimEditor } from './AudioTrimEditor';
import type { Track } from '../domain/types';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

/**
 * The one time Wave mentions dead air.
 *
 * It appears above the player, beside the song it belongs to, and stays until it
 * is answered — but it never takes the player's place, never covers it and never
 * asks twice. Removing the silence is a library decision: the file keeps every
 * sample, playback simply starts where the music starts.
 */
export function SilenceNotice({
  text,
  track,
  onTrim,
  onPreview,
  onRemove,
  onKeep,
  className,
}: {
  onPreview?: () => void;
  text: string | null;
  track?: Track;
  onTrim?: (bounds: { start: number; end: number }) => Promise<void>;
  onRemove: () => void;
  onKeep: () => void;
  /** Where it is standing: over the bar, or over the open player. */
  className?: string;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [bounds, setBounds] = useState<{ start: number; end: number } | null>(null);
  const animation = useWaveMotion();
  return (
    <>
      {reviewing && track && (
        <Modal title="We've detected silence in this track" onClose={() => setReviewing(false)}>
          <AudioTrimEditor track={track} onChange={setBounds} onPreview={onPreview} />
          <div className="modal-actions">
            <button
              className="tonal-button"
              onClick={() => {
                onKeep();
                setReviewing(false);
              }}
            >
              Keep it
            </button>
            <button
              className="filled-button"
              onClick={async () => {
                if (bounds && onTrim) await onTrim(bounds);
                else onRemove();
                setReviewing(false);
              }}
            >
              Remove silence
            </button>
          </div>
        </Modal>
      )}
      <AnimatePresence initial={false}>
        {text && (
          <motion.div
            className={`silence-notice${className ? ` ${className}` : ''}`}
            role="status"
            initial={animation.enabled ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animation.enabled ? { opacity: 0, y: 8 } : undefined}
            transition={animation.effects}
          >
            <span className="silence-notice-text">{text}</span>
            <div className="silence-notice-actions">
              <button
                type="button"
                className="tonal-button"
                onClick={() => (track?.blob ? setReviewing(true) : onRemove())}
              >
                Review silence
              </button>
              <button type="button" className="text-button" onClick={onKeep}>
                Keep it
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
