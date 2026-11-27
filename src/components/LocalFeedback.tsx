import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThumbsUp, ThumbsDown, X } from './Glyphs';
import { useT } from '../i18n';
import { motion } from 'motion/react';
import { useWaveMotion } from '../ui/motion';
import { FEEDBACK_KEY, feedbackEligible, type RecordState } from '../ui/localFeedback';

const DAY = 86_400_000;
const FEATURES = new Set([
  'Home',
  'Search',
  'Library',
  'Remix',
  'Settings',
  'Now playing',
  'Playlist import',
  'Mix',
]);
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
  } catch {}
  return { firstSeen: now, nextAt: now + 3 * DAY, uses: 0, ratings: [] };
}
function write(value: RecordState): boolean {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function LocalFeedback({ page }: { page?: string }) {
  const t = useT();
  const animation = useWaveMotion();
  const [feature, setFeature] = useState<string | null>(null);
  const [topDialog, setTopDialog] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (!write(read(Date.now()))) return;
    let considered = false;
    const used = (event: Event) => {
      const name = (event as CustomEvent<unknown>).detail;
      if (typeof name !== 'string' || !FEATURES.has(name)) return;
      const now = Date.now(),
        record = read(now);
      record.uses = Math.min(1000, record.uses + 1);
      write(record);
      if (
        considered ||
        document.hidden ||
        record.disabled ||
        now < record.nextAt ||
        now - record.firstSeen < 3 * DAY ||
        record.uses < 6
      )
        return;
      considered = true;
      if (!feedbackEligible(record, now, Math.random())) return;
      record.nextAt = now + 21 * DAY;
      if (write(record)) setFeature(name);
    };
    window.addEventListener('wave:feature-used', used);
    return () => window.removeEventListener('wave:feature-used', used);
  }, []);
  useEffect(() => {
    if (page && FEATURES.has(page))
      window.dispatchEvent(new CustomEvent('wave:feature-used', { detail: page }));
  }, [page]);
  useEffect(() => {
    if (!feature) return;
    const update = () =>
      setTopDialog(
        [...document.querySelectorAll<HTMLDialogElement>('dialog[open]:not([inert])')].at(-1) ??
          null,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'inert'],
    });
    return () => observer.disconnect();
  }, [feature]);
  if (!feature) return null;
  const issue = (helpful: boolean) =>
    `https://github.com/jaime-gaming/Wave/issues/new?${new URLSearchParams({ title: `Feedback: ${feature}`, body: `My experience with ${feature}: ${helpful ? 'I like it.' : 'It could be better.'}\n\n` })}`;
  const card = (
    <motion.aside
      initial={animation.enabled ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={animation.effects}
      className="local-feedback"
      aria-label={t('A moment for your opinion')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setFeature(null);
        }
      }}
    >
      <h3>{t('What do you think of {feature}?', { feature: t(feature) })}</h3>
      <div className="feedback-actions">
        <a
          className="feedback-choice"
          href={issue(true)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('Share positive feedback on GitHub')}
          title={t('Share positive feedback on GitHub')}
          onClick={() => setFeature(null)}
        >
          <ThumbsUp size={20} />
        </a>
        <a
          className="feedback-choice"
          href={issue(false)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('Share feedback on GitHub')}
          title={t('Share feedback on GitHub')}
          onClick={() => setFeature(null)}
        >
          <ThumbsDown size={20} />
        </a>
        <button
          type="button"
          className="icon-button feedback-close"
          aria-label={t('Close')}
          onClick={() => setFeature(null)}
        >
          <X size={18} />
        </button>
      </div>
    </motion.aside>
  );
  return topDialog ? createPortal(card, topDialog) : card;
}
