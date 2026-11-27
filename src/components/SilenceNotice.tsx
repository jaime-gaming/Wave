import { useState } from 'react';
import { Modal } from './Modal';
import { AudioTrimEditor } from './AudioTrimEditor';
import type { Track } from '../domain/types';
import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';

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
