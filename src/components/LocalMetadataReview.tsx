import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Music2, Sparkles } from './Glyphs';
import type { Track } from '../domain/types';
import { describeIssues, metadataIssues } from '../domain/metadata';
import { needsDetails } from '../domain/catalogue';

import { useT } from '../i18n';
/**
 * What the library still does not know about its own songs.
 *
 * Two halves of the same question: what the file itself is missing, and what
 * Wave filled in from a catalogue while the listener was elsewhere. The switch
 * is the listener's, the lookup happens in the background, and this panel is
 * the only place that ever mentions it.
 */
export function LocalMetadataReview({
  tracks,
  enabled,
  onToggle,
  onLookUp,
  filling = 0,
  completed = 0,
}: {
  tracks: Track[];
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  onLookUp?: () => void;
  filling?: number;
  completed?: number;
}) {
  const t = useT();
  const entries = useMemo(
    () =>
      tracks.flatMap((track) => {
        const issues = metadataIssues(track);
        return issues.length ? [{ track, issues }] : [];
      }),
    [tracks],
  );
  const gaps = useMemo(() => tracks.filter((track) => needsDetails(track)).length, [tracks]);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / 8)),
    current = Math.min(page, pages - 1);
  return (
    <section className="local-metadata" aria-label={t('Song details')}>
      <h3>{t('Song details')}</h3>
      <div className="settings-switch-row">
        <div>
          <strong>{t('Fill in missing details')}</strong>
          <span>
            Sends the names of incomplete songs to a catalogue to find the artist, album, year and
            cover. Off unless you turn it on.
          </span>
        </div>
        {onToggle && (
          <button
            type="button"
            className="material-switch"
            role="switch"
            aria-label={t('Fill in missing details')}
            aria-checked={enabled ?? false}
            onClick={() => onToggle(!enabled)}
          >
            <span>{enabled && <Check size={15} />}</span>
          </button>
        )}
      </div>
      <p>
        {!enabled
          ? t('Nothing leaves this device while this is off.')
          : filling
            ? `Looking up ${filling} ${filling === 1 ? 'song' : 'songs'}…`
            : gaps
              ? `${gaps} ${gaps === 1 ? 'song is' : 'songs are'} missing something${completed ? ` · ${completed} completed` : ''}`
              : t('Every song knows what it is.')}
      </p>
      {!!gaps && onLookUp && enabled && (
        <button className="tonal-button" onClick={onLookUp} disabled={!!filling}>
          <Sparkles size={17} aria-hidden="true" />
          {filling ? t('Looking up…') : t('Look up now')}
        </button>
      )}
      {!!entries.length && (
        <ul>
          {entries.slice(current * 8, current * 8 + 8).map(({ track, issues }) => (
            <li key={track.id}>
              <Music2 size={19} />
              <div>
                <strong title={track.title}>{track.title}</strong>
                <span>{describeIssues(issues)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label={t('Metadata pages')}>
          <button
            className="icon-button"
            aria-label={t('Previous metadata page')}
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            className="icon-button"
            aria-label={t('Next metadata page')}
            disabled={current + 1 === pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </nav>
      )}
    </section>
  );
}
