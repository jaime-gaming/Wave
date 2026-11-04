import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderSearch, Link2, Video } from './Glyphs';
import { Modal } from './Modal';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import type { Track } from '../domain/types';
import {
  canShowFolderPicker,
  forgetFolder,
  markFolderScanned,
  pickFolder,
  readFolder,
  rememberFolder,
  rememberedFolders,
  requestFolderAccess,
  supportsDirectoryInput,
  type DirectoryHandleLike,
} from '../data/folders';
import type { RememberedFolder } from '../data/library';

import { useT } from '../i18n';
/**
 * "Add music" now asks where the song comes from.
 *
 * - **This device** imports files, exactly as before (MP3, WAV, M4A, OGG, FLAC).
 * - **YouTube** stores a reference to a video and plays it through the official
 *   embed. Nothing is downloaded, converted or extracted: playback needs a
 *   connection and the provider stays visible.
 */
export function AddMusicDialog({
  onClose,
  onLocal,
  onFolderFiles,
  onYouTube,
  onAdded,
  busy = false,
}: {
  onClose: () => void;
  onLocal: () => void;
  /** Files found in a folder, handed to the same importer as any other file. */
  onFolderFiles: (files: File[]) => void;
  onYouTube: (link: string) => Promise<{ ok: boolean; error?: string; track?: Track }>;
  onAdded: (track: Track) => void;
  busy?: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<'choose' | 'youtube'>('choose');
  const [link, setLink] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const [folders, setFolders] = useState<RememberedFolder[]>([]);
  const [folderBusy, setFolderBusy] = useState('');
  const [folderError, setFolderError] = useState('');
  // The picker is preferred, but never at the cost of a dead button: inside a
  // frame, or where the API is missing, the folder input does the same job.
  const canPick = canShowFolderPicker();
  const canChooseDirectory = supportsDirectoryInput();

  useEffect(() => {
    if (mode === 'youtube') input.current?.focus();
  }, [mode]);
  useEffect(() => {
    let live = true;
    void rememberedFolders().then((saved) => {
      if (live) setFolders(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Reads a folder the listener has just granted, and hands its files to the
   * importer.
   *
   * The files are imported first and the folder is remembered afterwards,
   * without being awaited: a browser that refuses to store the handle (or a
   * profile whose database is mid-upgrade) must never be the reason a folder of
   * music fails to arrive.
   */
  const readGranted = async (handle: DirectoryHandleLike) => {
    setFolderBusy(handle.name || 'folder');
    setFolderError('');
    try {
      const files = await readFolder(handle);
      if (!files.length) {
        setFolderError(t('No music files in that folder.'));
        return;
      }
      onFolderFiles(files);
      onClose();
      void rememberFolder(handle)
        .then(() => rememberedFolders())
        .then((saved) => setFolders(saved))
        .catch(() => undefined);
    } catch {
      setFolderError(t('That folder could not be read. Nothing was imported.'));
    } finally {
      setFolderBusy('');
    }
  };

  /** Every fallback ends in the same place, so a folder arrives one way only. */
  const chooseFolder = async () => {
    if (canPick) {
      const pick = await pickFolder();
      if (pick.ok) return readGranted(pick.handle);
      if (pick.reason === 'cancelled') return;
      // Refused by the browser — a frame, a policy, an older build — so the
      // click is answered with the input instead of nothing at all.
      setFolderError(
        t('This window cannot open a folder chooser, so Wave is asking the usual way.'),
      );
    }
    if (canChooseDirectory) {
      directory.current?.click();
      return;
    }
    setFolderError(t('This browser cannot hand over a whole folder. Choose the files inside it.'));
  };

  const allowFolder = async (folder: RememberedFolder) => {
    setFolderError('');
    if (!folder.handle) {
      setFolderError(t('Pick that folder again to give Wave permission to read it.'));
      return;
    }
    const granted = await requestFolderAccess(folder);
    if (!granted) {
      setFolderError(t('The browser did not give access to that folder.'));
      return;
    }
    await readGranted(folder.handle as DirectoryHandleLike);
    void markFolderScanned(folder.id).catch(() => undefined);
  };

  const submit = async () => {
    if (!link.trim() || pending) return;
    setPending(true);
    setError('');
    const result = await onYouTube(link.trim());
    setPending(false);
    if (!result.ok || !result.track) {
      setError(result.error ?? t('That link could not be added.'));
      return;
    }
    onAdded(result.track);
    onClose();
  };

  return (
    <Modal title={t('Add music')} className="add-music-modal" onClose={onClose}>
      {mode === 'choose' ? (
        <>
          <div className="add-music-choices">
            <button
              type="button"
              className="add-music-choice"
              onClick={() => {
                onClose();
                onLocal();
              }}
              disabled={busy}
            >
              <FolderOpen size={24} aria-hidden="true" />
              <strong>{t('From this device')}</strong>
              <span>{t('MP3, WAV, M4A, OGG, FLAC.')}</span>
            </button>
            <button
              type="button"
              className="add-music-choice"
              onClick={() => void chooseFolder()}
              disabled={busy || (!canPick && !canChooseDirectory)}
              aria-label={t('Add a whole folder')}
            >
              <FolderSearch size={24} aria-hidden="true" />
              <strong>
                {folderBusy ? t('Reading {name}…', { name: folderBusy }) : t('A whole folder')}
              </strong>
              <span>
                {canChooseDirectory
                  ? canPick
                    ? t('Everything inside it, at any depth. Remembered for next time.')
                    : t('Everything inside it, at any depth.')
                  : t('Choose the files inside it instead.')}
              </span>
            </button>
            <button
              type="button"
              className="add-music-choice"
              onClick={() => setMode('youtube')}
              disabled={busy || !online}
              aria-label={networkAriaLabel(online, t('Add from YouTube'))}
            >
              <Video size={24} aria-hidden="true" />
              <strong>{networkLabel(online, t('From YouTube'))}</strong>
              <span>{online ? t('Paste a link.') : t('Needs a connection.')}</span>
            </button>
          </div>
          {!!folders.length && (
            <div className="folder-list">
              <p className="folder-list-title">{t('Folders Wave remembers')}</p>
              {folders.map((folder) => (
                <div className="folder-row" key={folder.id}>
                  <FolderOpen size={17} aria-hidden="true" />
                  <span>
                    <strong>{folder.name}</strong>
                    <small>
                      {folder.scannedAt
                        ? t('Read {date}', {
                            date: new Date(folder.scannedAt).toLocaleDateString(),
                          })
                        : t('Not read yet')}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void allowFolder(folder)}
                    disabled={!!folderBusy}
                  >
                    {folder.handle ? t('Allow and read again') : t('Pick again')}
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => {
                      void forgetFolder(folder.id).then(() =>
                        setFolders((current) => current.filter((entry) => entry.id !== folder.id)),
                      );
                    }}
                    aria-label={t('Forget {name}', { name: folder.name })}
                  >
                    {t('Forget')}
                  </button>
                </div>
              ))}
            </div>
          )}
          {folderError && (
            <p className="form-error" role="alert">
              {folderError}
            </p>
          )}
          <input
            ref={directory}
            type="file"
            multiple
            hidden
            // React does not type this one; every browser that reads folders uses it.
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])].filter((file) => file.size > 0);
              event.target.value = '';
              if (!files.length) {
                setFolderError(t('No music files in that folder.'));
                return;
              }
              onFolderFiles(files);
              onClose();
            }}
          />
        </>
      ) : (
        <>
          <div className="clip-link">
            <label>
              <Link2 size={16} aria-hidden="true" />
              <span className="sr-only">{t('YouTube link')}</span>
              <input
                ref={input}
                type="url"
                inputMode="url"
                placeholder="https://youtu.be/…"
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit();
                }}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => void submit()}
              disabled={!link.trim() || pending}
            >
              {pending ? t('Adding…') : t('Add song')}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="add-music-footer">
            <button type="button" className="text-button" onClick={() => setMode('choose')}>
              {t('Back')}
            </button>
          </div>
        </>
      )}
      <p className="add-music-note">
        {mode === 'youtube'
          ? t('Only the link is sent. Audio is never downloaded.')
          : t('Your files stay on this device.')}
      </p>
    </Modal>
  );
}
