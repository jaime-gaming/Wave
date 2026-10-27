import { useEffect, useState, useMemo } from 'react';
import { HardDrive, ShieldCheck, RefreshCw } from 'lucide-react';
import type { Track } from '../domain/types';
import { formatBytes, libraryFootprint, requestPersistentStorage } from '../data/storage';
export function StorageSettings({ tracks }: { tracks: Track[] }) {
  const footprint = useMemo(() => libraryFootprint(tracks), [tracks]);
  const [usage, setUsage] = useState<number | undefined>(),
    [quota, setQuota] = useState<number | undefined>(),
    [persisted, setPersisted] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const refresh = async () => {
    try {
      const info = await navigator.storage?.estimate?.();
      setUsage(info?.usage);
      setQuota(info?.quota);
      setPersisted((await navigator.storage?.persisted?.()) ?? false);
    } catch {
      setMessage('Storage estimates are unavailable in this browser.');
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section className="storage-settings" aria-label="Browser storage">
      <h3>
        <HardDrive size={20} />
        Browser storage
      </h3>
      <dl>
        <div>
          <dt>Original audio</dt>
          <dd>{formatBytes(footprint.audio)}</dd>
        </div>
        <div>
          <dt>Compact covers</dt>
          <dd>{formatBytes(footprint.artwork)}</dd>
        </div>
        <div>
          <dt>Saved lyrics</dt>
          <dd>{formatBytes(footprint.lyrics)}</dd>
        </div>
        {usage !== undefined && (
          <div>
            <dt>Origin usage estimate</dt>
            <dd>
              {formatBytes(usage)}
              {quota !== undefined ? ` / ${formatBytes(quota)}` : ''}
            </dd>
          </div>
        )}
      </dl>
      <p className="modal-description">
        Files are saved when imported, even if you never play them. Exact byte duplicates are
        skipped. Audio is stored once at original quality; covers are compact JPEGs and lyrics are
        small text records.
      </p>
      <div className="storage-actions">
        <button
          className="tonal-button"
          disabled={busy || persisted}
          onClick={async () => {
            setBusy(true);
            const protectedStorage = await requestPersistentStorage();
            setPersisted(protectedStorage);
            setMessage(
              protectedStorage
                ? 'Browser eviction protection enabled.'
                : 'The browser did not grant protection. Open Wave in its own tab and try again.',
            );
            await refresh();
            setBusy(false);
          }}
        >
          <ShieldCheck size={18} />
          {persisted ? 'Storage protected' : 'Protect stored files'}
        </button>
        <button
          className="icon-button"
          aria-label="Refresh storage estimate"
          onClick={() => void refresh()}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      {message && <p className="storage-message">{message}</p>}
      <p className="storage-message">
        Clearing site data removes your library, not your original files. Keep a copy of the
        originals.
      </p>
    </section>
  );
}
