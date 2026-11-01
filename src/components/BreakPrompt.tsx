import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { BREAK_BODY, BREAK_HEADLINE } from '../domain/breakTime';

/**
 * The long-session question.
 *
 * It appears only after the music has already stopped, so nothing is being
 * shouted over. It is a card, not a full-screen dialog: the library is still
 * there behind it, and leaving is a normal thing to do rather than a failure.
 * Both answers restart the count with more room, so declining is never a fight.
 */
export function BreakPrompt({
  open,
  onContinue,
  onStop,
}: {
  open: boolean;
  onContinue: () => void;
  onStop: () => void;
}) {
  const animation = useWaveMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="break-overlay"
          initial={animation.enabled ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={animation.enabled ? { opacity: 0 } : undefined}
          transition={animation.effects}
        >
          <motion.div
            className="break-card"
            role="dialog"
            aria-modal="true"
            aria-label={BREAK_HEADLINE}
            initial={animation.enabled ? { opacity: 0, y: 16, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={animation.enabled ? { opacity: 0, y: 10 } : undefined}
            transition={animation.effects}
          >
            <h2>{BREAK_HEADLINE}</h2>
            <p>{BREAK_BODY}</p>
            <div className="break-actions">
              <button type="button" className="tonal-button" onClick={onContinue}>
                Keep listening
              </button>
              <button type="button" className="filled-button" onClick={onStop} autoFocus>
                Take a break
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
