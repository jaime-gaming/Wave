import { motion } from 'motion/react';
import { Check } from './Glyphs';
import { useWaveMotion } from '../ui/motion';
import { useT } from '../i18n';
export function VolumeSettings({
  enabled,
  onChange,
  status,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  status: {
    supported: boolean;
    working: boolean;
    ready: number;
    adjusted?: number;
    untouched?: number;
    total: number;
    skipped: number;
  };
}) {
  const t = useT(),
    animation = useWaveMotion();
  return (
    <section className="volume-settings" aria-label={t('Volume balancing')}>
      <div className="settings-switch-row">
        <div>
          <strong>{t('Fix volume')}</strong>
          <p className="settings-switch-hint">
            {t(
              'Gently raises quiet recordings to a balanced listening level while leaving loud tracks untouched.',
            )}
          </p>
        </div>
        <button
          type="button"
          className="material-switch"
          role="switch"
          aria-label={t('Fix volume')}
          aria-checked={enabled}
          title={t(
            'Applies to local songs, including future imports. Turn it off to hear original levels.',
          )}
          disabled={!status.supported && !enabled}
          onClick={() => onChange(!enabled)}
        >
          <motion.span layout transition={animation.fast}>
            {enabled && <Check size={15} />}
          </motion.span>
        </button>
      </div>
      {!status.supported ? (
        <p role="status">{t('Volume balancing is not available in this browser.')}</p>
      ) : (
        enabled && (
          <div
            className={`volume-settings-status${!status.working && !status.skipped && !status.total ? ' sr-only' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span>
              {status.working
                ? t('Balancing your library…')
                : status.total
                  ? t('Library volume ready')
                  : t('Add local music to balance its volume.')}
            </span>
            {status.total > 0 && (
              <small>
                {status.working
                  ? t('{ready} of {total} recordings ready', {
                      ready: status.ready,
                      total: status.total,
                    })
                  : typeof status.adjusted === 'number' && typeof status.untouched === 'number'
                    ? t('{adjusted} adjusted · {untouched} already balanced', {
                        adjusted: status.adjusted,
                        untouched: status.untouched,
                      })
                    : t('{ready} of {total} recordings ready', {
                        ready: status.ready,
                        total: status.total,
                      })}
              </small>
            )}
            {status.working && (
              <div className="library-update-track volume-progress" aria-hidden="true">
                <motion.span
                  initial={false}
                  animate={{ scaleX: status.total ? status.ready / status.total : 0 }}
                  transition={animation.effects}
                />
              </div>
            )}
            {status.skipped > 0 && (
              <small>
                {t('Some recordings could not be measured and keep their original level.')}
              </small>
            )}
          </div>
        )
      )}
    </section>
  );
}
