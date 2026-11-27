import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Music2, Search } from './Glyphs';
import { MaterialSwitch } from './MaterialSwitch';
import type { Track } from '../domain/types';
import { describeIssues, knownArtistSet, metadataIssues } from '../domain/metadata';
import { needsDetails } from '../domain/catalogue';

import { useT } from '../i18n';

export function LocalMetadataReview({
  tracks,
  onResolveRoles,
  enabled,
  onToggle,
  onLookUp,
  filling = 0,
  onFindArtistPhotos,
  artistPhotoProgress,
  advanced,
}: {
  tracks: Track[];
  onResolveRoles?: (id: string, action: 'swap' | 'keep') => Promise<boolean>;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  onLookUp?: () => void;
  filling?: number;
  completed?: number;
  onFindArtistPhotos?: () => void;
  artistPhotoProgress?: { done: number; total: number; found: number } | null;
  advanced?: ReactNode;
}) {
  const t = useT();
  const entries = useMemo(() => {
    const knownArtists = knownArtistSet(tracks);
    return tracks.flatMap((track) => {
      const issues = metadataIssues(track, knownArtists);
      return issues.length ? [{ track, issues }] : [];
    });
  }, [tracks]);
  const gaps = useMemo(() => tracks.filter((track) => needsDetails(track)).length, [tracks]);
  const [saving, setSaving] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / 8)),
    current = Math.min(page, pages - 1);
  return (
    <section className="local-metadata" aria-label={t('Auto Fill')}>
      <div className="settings-switch-row">
        <div>
          <strong>{t('Auto Fill')}</strong>
          <span>
            {t(
              'Wave can find missing song details, covers and artist photos online. Song and artist names are shared with music catalogues; your audio stays here.',
            )}
          </span>
        </div>
        {onToggle && (
          <MaterialSwitch label={t('Auto Fill')} checked={enabled ?? false} onChange={onToggle} />
        )}
      </div>
      <div className="auto-fill-status">
        <Music2 size={18} aria-hidden="true" />
        <p role="status">
          {!enabled
            ? t('Wave won’t look up song details while this is off.')
            : filling
              ? t('Looking after your music…')
              : gaps
                ? t('{count} songs could use a little more detail.', { count: gaps })
                : t('Every song knows what it is.')}
        </p>
        {!!gaps && onLookUp && enabled && (
          <button className="tonal-button" onClick={onLookUp} disabled={!!filling}>
            <Search size={17} aria-hidden="true" />
            {filling ? t('Looking up…') : t('Look up now')}
          </button>
        )}
      </div>
      {advanced && (
        <details className="auto-fill-review auto-fill-advanced">
          <summary>
            {t('Advanced options')} <ChevronRight size={18} aria-hidden="true" />
          </summary>
          <div className="auto-fill-advanced-content">{advanced}</div>
        </details>
      )}
      <details className="auto-fill-review">
        <summary>
          {t('Review your library')} <ChevronRight size={18} aria-hidden="true" />
        </summary>
        {onFindArtistPhotos && (
          <div className="metadata-artist-search">
            <strong>{t('Artist photos')}</strong>
            <p>
              {t(
                'Search Deezer for missing artist photos. Artist names are sent for this search. Your own photos are never replaced.',
              )}
            </p>
            <button
              className="tonal-button"
              onClick={onFindArtistPhotos}
              disabled={
                !!artistPhotoProgress && artistPhotoProgress.done < artistPhotoProgress.total
              }
            >
              <Search size={17} aria-hidden="true" /> {t('Find artist photos')}
            </button>
            {artistPhotoProgress && (
              <p role="status">
                {t('{done} of {total} artists checked · {found} photos found', artistPhotoProgress)}
              </p>
            )}
          </div>
        )}
        {!!entries.length && (
          <ul>
            {entries.slice(current * 8, current * 8 + 8).map(({ track, issues }) => (
              <li key={track.id}>
                <Music2 size={19} />
                <div>
                  <strong title={track.title}>{track.title}</strong>
                  <span>{describeIssues(issues)}</span>
                  {issues.includes('roles') && onResolveRoles && (
                    <div className="metadata-role-actions">
                      <small>
                        {t(
                          'File names can use either order. Choose the correct details for this song.',
                        )}
                      </small>
                      {(['swap', 'keep'] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="text-button"
                          disabled={saving !== null}
                          onClick={async () => {
                            setSaving(track.id);
                            setFailure('');
                            try {
                              if (!(await onResolveRoles(track.id, action)))
                                setFailure(t('Changes could not be saved. Please try again.'));
                            } catch {
                              setFailure(t('Changes could not be saved. Please try again.'));
                            } finally {
                              setSaving(null);
                            }
                          }}
                        >
                          {saving === track.id
                            ? t('Saving…')
                            : action === 'swap'
                              ? t('Swap title and artist')
                              : t('These details are correct')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {failure && <p role="alert">{failure}</p>}
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
      </details>
    </section>
  );
}
