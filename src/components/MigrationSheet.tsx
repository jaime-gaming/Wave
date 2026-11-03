import { useRef, useState } from 'react';
import { ArrowLeft, Check, CircleDashed, FileUp, ListMusic, Upload, X } from './Glyphs';
import { motion } from 'motion/react';
import { Modal } from './Modal';
import { isLink, parsePlaylistText, type ParsedList } from '../domain/importFile';
import { PROVIDER_LIMITS, parseImportLink, providerLabel } from '../domain/linkImport';
import {
  DEFAULT_MATCH_OPTIONS,
  matchEntries,
  suggestedPlaylistName,
  type ImportReport,
  type MatchCandidate,
} from '../domain/playlistImport';
import type { Track } from '../domain/types';
import { useWaveMotion } from '../ui/motion';

import { useT } from '../i18n';
/**
 * Bringing playlists over from another app.
 *
 * Everything is shown before anything is written: how many songs matched, which
 * ones are uncertain and which ones Wave simply does not have. Only the accepted
 * matches become a playlist, and the songs already in the library are never
 * moved, renamed or removed.
 */
export function MigrationSheet({
  tracks,
  onSave,
  onClose,
}: {
  tracks: Track[];
  onSave: (name: string, trackIds: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [list, setList] = useState<ParsedList | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const motionProps = useWaveMotion();

  const candidates: MatchCandidate[] = tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
  }));

  /** Reads whatever was pasted or chosen, and stages the proposal. */
  const inspect = (raw: string, fromFile?: string) => {
    setError('');
    setSaved(false);
    if (isLink(raw)) {
      const link = parseImportLink(raw);
      if (!link.ok) {
        setError(link.message);
        return;
      }
      // The list behind a link lives in the provider's account area, which Wave
      // cannot reach without an account and a server of its own.
      const limits = PROVIDER_LIMITS[link.target.provider];
      setList(null);
      setReport(null);
      setError(
        `A ${providerLabel(link.target.provider)} ${link.target.kind} cannot be read from the link: ${limits.limitation} Export the list instead — a playlist file, a CSV from your account export, or the songs copied as text — and Wave will match it against the music already here.`,
      );
      return;
    }
    const parsed = parsePlaylistText(raw);
    if (!parsed.entries.length) {
      setError(
        parsed.skipped
          ? t('That text did not contain any songs Wave could read.')
          : t('Paste a playlist, or choose the file your other app exported.'),
      );
      return;
    }
    const result = matchEntries(parsed.entries, candidates, DEFAULT_MATCH_OPTIONS);
    setList(parsed);
    setReport(result);
    setName(parsed.name ?? suggestedPlaylistName(fromFile, 'the other app'));
  };

  const status = (value: 'matched' | 'ambiguous' | 'missing') =>
    value === 'matched' ? (
      <Check size={15} aria-hidden="true" />
    ) : value === 'ambiguous' ? (
      <CircleDashed size={15} aria-hidden="true" />
    ) : (
      <X size={15} aria-hidden="true" />
    );

  const confirm = async () => {
    if (!report || saving) return;
    setSaving(true);
    setError('');
    const created = await onSave(name.trim() || t('Imported playlist'), report.trackIds);
    if (created) setSaved(true);
    else setError(t('That playlist could not be saved. Nothing was changed.'));
    setSaving(false);
  };

  return (
    <Modal title={t('Bring your playlists over')} className="migration-sheet" onClose={onClose}>
      {saved ? (
        <div className="migration-done">
          <Check size={28} aria-hidden="true" />
          <h3>{name.trim() || t('Your playlist')} is here</h3>
          <p>
            {report?.matchedCount} {report?.matchedCount === 1 ? 'song is' : 'songs are'} in your
            library now, in the list&apos;s order.
          </p>
          <button className="filled-button" onClick={onClose}>
            Back to playlists
          </button>
        </div>
      ) : !report || !list ? (
        <div className="migration-input">
          <p className="modal-description">
            {t('Paste a playlist, or choose the file it exported.')}
          </p>
          <label className="form-field">
            Playlist, song list or link
            <textarea
              rows={5}
              value={text}
              placeholder={
                '#EXTM3U\n#EXTINF:214,Nils Frahm - Says\n\nor\n\nArtist - Title, one per line'
              }
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div className="migration-actions">
            <button
              className="filled-button"
              disabled={!text.trim()}
              onClick={() => inspect(text, 'pasted list')}
            >
              <ListMusic size={18} aria-hidden="true" />
              Read this list
            </button>
            <button className="tonal-button" onClick={() => file.current?.click()}>
              <FileUp size={18} aria-hidden="true" />
              Choose a file
            </button>
            <input
              ref={file}
              type="file"
              accept=".m3u,.m3u8,.csv,.txt,text/plain,text/csv"
              hidden
              onChange={async (event) => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (!chosen) return;
                // A playlist file is text, and small; anything else is refused
                // rather than read into memory.
                if (chosen.size > 8_000_000) {
                  setError(t('That file is too large to be a playlist.'));
                  return;
                }
                const content = await chosen.text();
                setText(content);
                inspect(content, chosen.name.replace(/\.[a-z0-9]+$/iu, ''));
              }}
            />
          </div>
          <p className="migration-hint">
            <code>.m3u</code>, <code>.csv</code> or one song per line. A Spotify or YouTube link
            opens nothing on its own: those lists belong to an account.
          </p>
        </div>
      ) : (
        <div className="migration-review">
          <div className="migration-summary">
            <div>
              <strong>
                {report.matchedCount} of {report.matches.length}
              </strong>
              <span>songs are already here</span>
            </div>
            <ul>
              <li className="matched">
                {status('matched')} {report.matchedCount} matched
              </li>
              <li className="ambiguous">
                {status('ambiguous')} {report.ambiguousCount} to check
              </li>
              <li className="missing">
                {status('missing')} {report.missingCount} not in your library
              </li>
            </ul>
          </div>
          <label className="form-field">
            Name for the new playlist
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <motion.ul
            className="migration-rows"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionProps.reveal}
          >
            {report.matches.slice(0, 60).map((match) => (
              <li key={match.entry.id} className={match.status}>
                {status(match.status)}
                <span>
                  <strong>{match.entry.title}</strong>
                  <small>
                    {match.entry.artist || t('Unknown artist')}
                    {match.status === 'matched' && match.trackId
                      ? ` · ${tracks.find((track) => track.id === match.trackId)?.title ?? ''}`
                      : match.status === 'ambiguous'
                        ? ' · closest song needs a listen'
                        : ' · not in your library'}
                  </small>
                </span>
              </li>
            ))}
          </motion.ul>
          {report.matches.length > 60 && (
            <p className="migration-hint">
              Showing the first 60 of {report.matches.length}. All matched songs will be added.
            </p>
          )}
          {!!report.missingCount && (
            <p className="migration-hint">{t('Songs you do not have yet are left out.')}</p>
          )}
          <div className="migration-actions">
            <button className="tonal-button" onClick={() => setReport(null)} disabled={saving}>
              <ArrowLeft size={18} aria-hidden="true" />
              Back
            </button>
            <button
              className="filled-button"
              disabled={saving || !report.trackIds.length}
              onClick={() => void confirm()}
            >
              <Upload size={18} aria-hidden="true" />
              {saving ? t('Saving…') : `Create playlist with ${report.trackIds.length}`}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
