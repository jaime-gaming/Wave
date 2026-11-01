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
  onRemove,
  onKeep,
}: {
  text: string | null;
  onRemove: () => void;
  onKeep: () => void;
}) {
  const animation = useWaveMotion();
  return (
    <AnimatePresence initial={false}>
      {text && (
        <motion.div
          className="silence-notice"
          role="status"
          initial={animation.enabled ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={animation.enabled ? { opacity: 0, y: 8 } : undefined}
          transition={animation.effects}
        >
          <span className="silence-notice-text">{text}</span>
          <div className="silence-notice-actions">
            <button type="button" className="tonal-button" onClick={onRemove}>
              Remove it
            </button>
            <button type="button" className="text-button" onClick={onKeep}>
              Keep it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
