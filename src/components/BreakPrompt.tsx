import { AnimatePresence, motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { BREAK_BODY, BREAK_HEADLINE } from '../domain/breakTime';
import { useT } from '../i18n';

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
  const t = useT();
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
            aria-label={t(BREAK_HEADLINE)}
            initial={animation.enabled ? { opacity: 0, y: 16, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={animation.enabled ? { opacity: 0, y: 10 } : undefined}
            transition={animation.effects}
          >
            <h2>{t(BREAK_HEADLINE)}</h2>
            <p>{t(BREAK_BODY)}</p>
            <div className="break-actions">
              <button type="button" className="tonal-button" onClick={onContinue}>
                {t('Keep listening')}
              </button>
              <button type="button" className="filled-button" onClick={onStop} autoFocus>
                {t('Take a break')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
