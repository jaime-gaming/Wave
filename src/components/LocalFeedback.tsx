import { useEffect, useState } from 'react';
import { Info, X } from './Glyphs';
import { useT } from '../i18n';

import { FEEDBACK_KEY, feedbackEligible, type RecordState } from '../ui/localFeedback';
const DAY = 86_400_000;
const FEATURES = new Set(['Remix', 'Playlist import', 'Mix']);
function read(now: number): RecordState {
  try {
    const value = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? 'null');
    if (
      value &&
      Number.isFinite(value.firstSeen) &&
      Number.isFinite(value.nextAt) &&
      Number.isFinite(value.uses) &&
      Array.isArray(value.ratings)
    )
      return value;
  } catch {
    /* Refused storage: no prompt. */
  }
  return { firstSeen: now, nextAt: now + 7 * DAY, uses: 0, ratings: [] };
}
function write(value: RecordState): boolean {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Occasional reflection, never a survey service. No network request or analytics. */
export function LocalFeedback() {
  const t = useT();
  const [feature, setFeature] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    const now = Date.now();
    if (!write(read(now))) return;
    let considered = false;
    const used = (event: Event) => {
      const name = (event as CustomEvent<unknown>).detail;
      if (typeof name !== 'string' || !FEATURES.has(name)) return;
      const now = Date.now(),
        record = read(now);
      record.uses = Math.min(1000, record.uses + 1);
      write(record);
      if (considered || document.hidden || document.querySelector('[aria-modal="true"]')) return;
      // At most one lottery per page session, only after sustained usage.
      if (
        record.disabled ||
        now < record.nextAt ||
        now - record.firstSeen < 7 * DAY ||
        record.uses < 12
      )
        return;
      considered = true;
      if (!feedbackEligible(record, now, Math.random())) return;
      record.nextAt = now + 30 * DAY;
      if (!write(record)) return;
      setFeature(name);
    };
    window.addEventListener('wave:feature-used', used);
    return () => window.removeEventListener('wave:feature-used', used);
  }, []);
  useEffect(() => {
    if (!thanks) return;
    const timer = setTimeout(() => {
      setFeature(null);
      setThanks(false);
    }, 2200);
    return () => clearTimeout(timer);
  }, [thanks]);
  if (!feature) return null;
  const close = (disable = false) => {
    if (disable) write({ ...read(Date.now()), disabled: true });
    setFeature(null);
  };
  return (
    <aside
      className="local-feedback"
      role="dialog"
      aria-label={t('A moment for your opinion')}
      aria-modal="false"
    >
      <button
        type="button"
        className="icon-button feedback-close"
        aria-label={t('Close')}
        onClick={() => close()}
      >
        <X size={18} />
      </button>
      <Info size={20} aria-hidden="true" />
      {thanks ? (
        <p role="status">{t('Saved on this device. Thank you for taking a moment.')}</p>
      ) : (
        <>
          <h3>{t('How is {feature} working for you?', { feature: t(feature) })}</h3>
          <p>
            {t(
              'Just for you: your answer stays in this browser. It is not sent to Wave or used to change the feature.',
            )}
          </p>
          <div className="feedback-actions">
            {[true, false].map((helpful) => (
              <button
                key={String(helpful)}
                className="tonal-button"
                onClick={() => {
                  const record = read(Date.now());
                  record.ratings = [
                    ...record.ratings.slice(-9),
                    { feature, helpful, at: Date.now() },
                  ];
                  if (write(record)) setThanks(true);
                  else close();
                }}
              >
                {helpful ? t('Works well') : t('Needs work')}
              </button>
            ))}
          </div>
          <button className="text-button" onClick={() => close(true)}>
            {t('Do not ask again')}
          </button>
        </>
      )}
    </aside>
  );
}
