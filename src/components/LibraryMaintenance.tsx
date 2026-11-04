import { useState } from 'react';
import type { Track } from '../domain/types';
import { contentIdentity } from '../data/import';
import { mergeExactDuplicates } from '../data/library';
import { duplicateNames } from '../domain/duplicates';
import { useT } from '../i18n';
export function LibraryMaintenance({
  tracks,
  currentId,
  onMerged,
}: {
  tracks: Track[];
  currentId?: string;
  onMerged: () => Promise<void>;
}) {
  const t = useT();
  const [groups, setGroups] = useState<Track[][]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const names = duplicateNames(tracks);
  return (
    <section className="maintenance-card">
      <h3>{t('Duplicate tracks')}</h3>
      <p>{t('Same names can be different recordings. Only byte-identical files can be merged.')}</p>
      <button
        className="tonal-button"
        disabled={busy || !tracks.length}
        onClick={async () => {
          setBusy(true);
          try {
            const map = new Map<string, Track[]>();
            for (const track of tracks) {
              // Songs played from YouTube have no local bytes to compare.
              if (!track.blob) continue;
              const hash = await contentIdentity(track.blob);
              map.set(hash, [...(map.get(hash) ?? []), track]);
            }
            const found = [...map.values()].filter((group) => group.length > 1);
            setGroups(found);
            setMessage(
              found.length
                ? t('{count} identical groups found.', { count: found.length })
                : t('No byte-identical duplicates.'),
            );
          } catch {
            setMessage(t('Scan failed. Try again.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t('Checking files…') : t('Scan duplicate files')}
      </button>
      {groups.map((group) => (
        <div className="duplicate-group" key={group[0].id}>
          <strong>
            {group[0].title} · {t('{count} copies', { count: group.length })}
          </strong>
          <p>{group.map((track) => track.fileName).join(' · ')}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await mergeExactDuplicates(
                  group.find((track) => track.id === currentId)?.id ?? group[0].id,
                  group.map((track) => track.id),
                );
                await onMerged();
                setGroups((current) => current.filter((item) => item !== group));
                setMessage(
                  t('Identical copies merged; favorites and playlist references retained.'),
                );
              } catch (error) {
                setMessage(error instanceof Error ? t(error.message) : t('Merge failed.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Merge identical copies')}
          </button>
        </div>
      ))}
      <p role="status">{message}</p>
      {names.length > 0 && (
        <details>
          <summary>
            {t('{count} same-name groups · review versions', { count: names.length })}
          </summary>
          {names.map((group) => (
            <div className="duplicate-group" key={group[0].id}>
              <strong>
                {group[0].title} · {group[0].artist}
              </strong>
              {group.map((track) => (
                <p key={track.id}>
                  {track.album} · {track.fileName} · {track.size} bytes
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
