import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import type { Track } from '../domain/types';
import { metadataIssues } from '../domain/metadata';
export function LocalMetadataReview({ tracks }: { tracks: Track[] }) {
  const entries = useMemo(
    () =>
      tracks.flatMap((track) => {
        const issues = metadataIssues(track);
        return issues.length ? [{ track, issues }] : [];
      }),
    [tracks],
  );
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / 8)),
    current = Math.min(page, pages - 1);
  return (
    <section className="local-metadata" aria-label="Local metadata">
      <h3>Local metadata</h3>
      <p>
        Tags, duration and embedded covers are checked on your device. No catalogue searches or
        cover downloads.
      </p>
      <p>
        {entries.length
          ? `${entries.length} ${entries.length === 1 ? 'song has' : 'songs have'} missing details. Enable Library editing to change them in Song options.`
          : 'No missing fields found.'}
      </p>
      <ul>
        {entries.slice(current * 8, current * 8 + 8).map(({ track, issues }) => (
          <li key={track.id}>
            <Music2 size={19} />
            <div>
              <strong title={track.title}>{track.title}</strong>
              <span>Missing: {issues.join(', ')}</span>
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label="Metadata pages">
          <button
            className="icon-button"
            aria-label="Previous metadata page"
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
            aria-label="Next metadata page"
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
