import { useT } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Repeat1 } from './Glyphs';
import { useWaveMotion } from '../ui/motion';

/** A short acknowledgement of an actual restart, not a change to the audio. */
export function RepeatNotice({ serial }: { serial: number }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const lastSerial = useRef(serial);
  const animation = useWaveMotion();
  useEffect(() => {
    if (!serial || serial === lastSerial.current) return;
    lastSerial.current = serial;
    const show = setTimeout(() => setVisible(true), 0);
    const hide = setTimeout(() => setVisible(false), 1800);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [serial]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="repeat-notice"
          role="status"
          initial={animation.enabled ? { opacity: 0, x: '-50%', y: 5 } : false}
          animate={{ opacity: 1, x: '-50%', y: 0 }}
          exit={{ opacity: 0 }}
          transition={animation.effects}
        >
          <motion.span
            key={serial}
            initial={{ rotate: 0 }}
            animate={{ rotate: animation.enabled ? 360 : 0 }}
            transition={{ duration: animation.enabled ? 0.65 : 0 }}
          >
            <Repeat1 size={18} />
          </motion.span>
          {t('Playing again')}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
