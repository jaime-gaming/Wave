import { AudioTrimEditor } from './AudioTrimEditor';
import { useState } from 'react';
import { RotateCcw, Save, Search } from './Glyphs';
import { formatTime, type Track, type TrackMetadata } from '../domain/types';
import { catalogueQuery, scoreRelease, type CatalogueRelease } from '../domain/catalogue';
import { downloadCover, preferredCountry, searchCatalogue } from '../services/catalogue';
import { readArtwork } from '../data/artwork';
import { useOnline } from '../ui/network';
import { Modal } from './Modal';
import { ArtworkPicker } from './ArtworkPicker';
import { ClipSection } from './ClipSection';

import { useT } from '../i18n';
export function TrackEditor({
  track,
  onClose,
  onSave,
  onRestore,
  onRestoreSilence,
  onTrim,
  onPreview,
  previewVolume,
}: {
  onPreview?: () => void;
  previewVolume?: number;
  onTrim?: (bounds: { start: number; end: number }) => Promise<void>;
  track: Track;
  onClose: () => void;
  onSave: (id: string, metadata: TrackMetadata) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
  /** Gives the silent edges back, leaving every byte of the file as it was. */
  onRestoreSilence?: (id: string) => Promise<void>;
}) {
  const t = useT();
  const online = useOnline();
  const [metadata, setMetadata] = useState<TrackMetadata>({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
  });
  const [trimming, setTrimming] = useState(false);
  const [bounds, setBounds] = useState<{ start: number; end: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const [matchingOpen, setMatchingOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => catalogueQuery(track));
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Array<{ release: CatalogueRelease; score: number }>>([]);
  const [searchNote, setSearchNote] = useState('');
  const [applyingCover, setApplyingCover] = useState(false);
  const busy = saving || imageBusy || applyingCover;

  const runCatalogueSearch = async (termOverride?: string) => {
    const query = (termOverride ?? searchTerm).trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchNote('');
    const previewTrack: Track = {
      ...track,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
    };
    const results = await searchCatalogue(query, { country: preferredCountry() });
    const ranked = results
      .map((release) => ({ release, score: scoreRelease(previewTrack, release) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    setMatches(ranked);
    if (!ranked.length) {
      setSearchNote(t('No matching releases found. Try adjusting the artist or title.'));
    }
    setSearching(false);
  };

  const applyMatch = async (release: CatalogueRelease) => {
    setMetadata((current) => ({
      ...current,
      title: release.title || current.title,
      artist: release.artist || current.artist,
      album: release.album || current.album,
    }));
    if (release.artworkUrl) {
      setApplyingCover(true);
      try {
        const file = await downloadCover(release.artworkUrl);
        if (file) {
          const artwork = await readArtwork(file);
          setMetadata((current) => ({ ...current, artwork }));
        }
      } catch {
        /* Text fields are already aligned even if cover download fails. */
      } finally {
        setApplyingCover(false);
      }
    }
    setMatchingOpen(false);
  };
  return (
    <Modal
      title={trimming ? 'Trim audio' : t('Edit song')}
      closeDisabled={busy}
      className="editor-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!trimming && (
        <p className="modal-description">
          Changes apply to your Wave library. Your original audio file stays unchanged.
        </p>
      )}
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setSaving(true);
          setError('');
          if (await onSave(track.id, metadata)) {
            if (bounds) await onTrim?.(bounds);
            onClose();
          } else setError(t('Changes could not be saved. Please try again.'));
          setSaving(false);
        }}
      >
        {trimming ? (
          <>
            <AudioTrimEditor
              track={track}
              value={bounds}
              onChange={setBounds}
              onPreview={onPreview}
              volume={previewVolume}
            />
            <button type="button" className="tonal-button" onClick={() => setTrimming(false)}>
              ← Back to song details
            </button>
          </>
        ) : (
          <>
            <ArtworkPicker
              value={metadata.artwork}
              disabled={busy}
              onChange={(artwork) => setMetadata((current) => ({ ...current, artwork }))}
              onBusy={setImageBusy}
            />
            {(['title', 'artist', 'album'] as const).map((field) => (
              <label className="form-field" key={field}>
                {field[0].toUpperCase() + field.slice(1)}
                <input
                  value={metadata[field]}
                  required={field === 'title'}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) =>
                    setMetadata((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
              </label>
            ))}
            {online && (
              <div className="metadata-matcher">
                <button
                  type="button"
                  className="editor-submenu-button"
                  disabled={busy}
                  onClick={() => {
                    const nextOpen = !matchingOpen;
                    setMatchingOpen(nextOpen);
                    if (nextOpen && !matches.length) {
                      const nextTerm = catalogueQuery({
                        ...track,
                        title: metadata.title,
                        artist: metadata.artist,
                      });
                      setSearchTerm(nextTerm);
                      void runCatalogueSearch(nextTerm);
                    }
                  }}
                >
                  <span>
                    <strong>{t('Find song details')}</strong>
                    <small>{t('Search and align title, artist, album and cover')}</small>
                  </span>
                  <Search size={18} aria-hidden="true" />
                </button>
                {matchingOpen && (
                  <div className="metadata-matcher-panel">
                    <div className="metadata-matcher-bar">
                      <input
                        type="search"
                        value={searchTerm}
                        placeholder={t('Artist and song title')}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void runCatalogueSearch();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="tonal-button"
                        disabled={searching || !searchTerm.trim()}
                        onClick={() => void runCatalogueSearch()}
                      >
                        {searching ? t('Searching…') : t('Search')}
                      </button>
                    </div>
                    {searchNote && <p className="metadata-matcher-note">{searchNote}</p>}
                    {!!matches.length && (
                      <div className="metadata-matcher-list">
                        {matches.map(({ release, score }, index) => {
                          const delta =
                            track.duration > 0 && release.duration
                              ? Math.abs(release.duration - track.duration)
                              : null;
                          const aligned = delta !== null && delta <= 4;
                          return (
                            <button
                              key={`${release.title}-${release.artist}-${index}`}
                              type="button"
                              className="metadata-match-row"
                              disabled={busy}
                              onClick={() => void applyMatch(release)}
                            >
                              {release.artworkUrl && (
                                <img src={release.artworkUrl} alt="" loading="lazy" />
                              )}
                              <span className="metadata-match-info">
                                <strong>{release.title}</strong>
                                <small>
                                  {release.artist}
                                  {release.album ? ` · ${release.album}` : ''}
                                  {release.year ? ` (${release.year})` : ''}
                                </small>
                              </span>
                              <span className="metadata-match-meta">
                                {release.duration ? formatTime(release.duration) : ''}
                                {aligned && (
                                  <em className="metadata-match-badge">{t('Exact match')}</em>
                                )}
                                {!aligned && score >= 0.72 && (
                                  <em className="metadata-match-badge">{t('Close match')}</em>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <ClipSection track={track} />
            {track.blob && (
              <button
                type="button"
                className="editor-submenu-button"
                onClick={() => setTrimming(true)}
              >
                <span>
                  <strong>Trim audio</strong>
                  <small>Shape the beginning and ending</small>
                </span>
                <span>↗</span>
              </button>
            )}
            {/*
             * Silent edges, offered once they have been measured. The original file
             * is never altered: skipping silence is a pair of bounds, and undoing it
             * gives the song back exactly as it arrived.
             */}
            {track.trim && (
              <button
                type="button"
                className="text-button silence-editor-restore"
                disabled={busy}
                onClick={async () => {
                  setSaving(true);
                  await onRestoreSilence?.(track.id);
                  setSaving(false);
                }}
              >
                <RotateCcw size={18} />
                Play the whole file again
              </button>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {track.originalMetadata && (
              <button
                type="button"
                className="text-button restore-metadata"
                disabled={busy}
                onClick={async () => {
                  setSaving(true);
                  if (await onRestore(track.id)) onClose();
                  else setError(t('Original information could not be restored.'));
                  setSaving(false);
                }}
              >
                <RotateCcw size={18} />
                Restore original information and cover
              </button>
            )}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="tonal-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="filled-button" disabled={busy || !metadata.title.trim()}>
            <Save size={18} />
            {saving ? t('Saving…') : t('Save changes')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
