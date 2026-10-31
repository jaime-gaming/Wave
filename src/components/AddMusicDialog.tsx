import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderSearch, Link2, Video } from 'lucide-react';
import { Modal } from './Modal';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import type { Track } from '../domain/types';
import {
  forgetFolder,
  markFolderScanned,
  pickFolder,
  readFolder,
  rememberFolder,
  rememberedFolders,
  requestFolderAccess,
  supportsDirectoryInput,
  supportsFolderPicker,
  type DirectoryHandleLike,
} from '../data/folders';
import type { RememberedFolder } from '../data/library';

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
  const canPick = supportsFolderPicker();
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
   * importer. Nothing is remembered unless the browser lets the handle be
   * stored, and the remember step never blocks the import itself.
   */
  const readGranted = async (handle: DirectoryHandleLike) => {
    setFolderBusy(handle.name);
    setFolderError('');
    try {
      const files = await readFolder(handle);
      if (!files.length) {
        setFolderError('No music files in that folder.');
        return;
      }
      // Remembered before the import so a slow library update cannot lose it.
      await rememberFolder(handle).catch(() => undefined);
      setFolders(await rememberedFolders());
      onFolderFiles(files);
      onClose();
    } catch {
      setFolderError('That folder could not be read. Nothing was imported.');
    } finally {
      setFolderBusy('');
    }
  };

  const chooseFolder = async () => {
    if (canPick) {
      const handle = await pickFolder();
      if (handle) await readGranted(handle);
      return;
    }
    // Firefox and Safari: a directory input still hands over the whole folder,
    // one level of permission and no handle to keep.
    directory.current?.click();
  };

  const allowFolder = async (folder: RememberedFolder) => {
    setFolderError('');
    if (!folder.handle) {
      setFolderError('Pick that folder again to give Wave permission to read it.');
      return;
    }
    const granted = await requestFolderAccess(folder);
    if (!granted) {
      setFolderError('The browser did not give access to that folder.');
      return;
    }
    await readGranted(folder.handle as DirectoryHandleLike);
    await markFolderScanned(folder.id).catch(() => undefined);
  };

  const submit = async () => {
    if (!link.trim() || pending) return;
    setPending(true);
    setError('');
    const result = await onYouTube(link.trim());
    setPending(false);
    if (!result.ok || !result.track) {
      setError(result.error ?? 'That link could not be added.');
      return;
    }
    onAdded(result.track);
    onClose();
  };

  return (
    <Modal title="Add music" className="add-music-modal" onClose={onClose}>
      {mode === 'choose' ? (
        <>
          <p className="modal-description">
            Import files from this device, or add a song from YouTube by link. Local files never
            leave the device; a YouTube song plays through YouTube&apos;s own player and is never
            downloaded.
          </p>
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
              <strong>Import local files</strong>
              <span>MP3, WAV, M4A, OGG or FLAC, up to 200 MB each. Original files, untouched.</span>
            </button>
            <button
              type="button"
              className="add-music-choice"
              onClick={() => void chooseFolder()}
              disabled={busy || (!canPick && !canChooseDirectory)}
              aria-label="Add a folder from this device"
            >
              <FolderSearch size={24} aria-hidden="true" />
              <strong>{folderBusy ? `Reading ${folderBusy}…` : 'Add a whole folder'}</strong>
              <span>
                {canPick
                  ? 'Choose a folder and Wave reads every song inside it, at any depth. It asks once for permission, and the folder is remembered so you can read it again.'
                  : canChooseDirectory
                    ? 'Choose a folder and Wave reads every song inside it. This browser cannot remember a folder afterwards, so you will pick it again next time.'
                    : 'This browser cannot hand over a folder. Choose the files inside it instead.'}
              </span>
            </button>
            <button
              type="button"
              className="add-music-choice"
              onClick={() => setMode('youtube')}
              disabled={busy || !online}
              aria-label={networkAriaLabel(online, 'Add from YouTube')}
            >
              <Video size={24} aria-hidden="true" />
              <strong>{networkLabel(online, 'Add from YouTube')}</strong>
              <span>
                {online
                  ? 'Paste a video link. The song plays from YouTube with its video, and Wave keeps its own controls.'
                  : 'Adding a YouTube song needs a connection. Files on this device work offline.'}
              </span>
            </button>
          </div>
          {!!folders.length && (
            <div className="folder-list">
              <p className="folder-list-title">Folders Wave remembers</p>
              {folders.map((folder) => (
                <div className="folder-row" key={folder.id}>
                  <FolderOpen size={17} aria-hidden="true" />
                  <span>
                    <strong>{folder.name}</strong>
                    <small>
                      {folder.scannedAt
                        ? `Read ${new Date(folder.scannedAt).toLocaleDateString()}`
                        : 'Not read yet'}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void allowFolder(folder)}
                    disabled={!!folderBusy}
                  >
                    {folder.handle ? 'Allow and read again' : 'Pick again'}
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => {
                      void forgetFolder(folder.id).then(() =>
                        setFolders((current) => current.filter((entry) => entry.id !== folder.id)),
                      );
                    }}
                    aria-label={`Forget ${folder.name}`}
                  >
                    Forget
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
                setFolderError('No music files in that folder.');
                return;
              }
              onFolderFiles(files);
              onClose();
            }}
          />
        </>
      ) : (
        <>
          <p className="modal-description">
            Paste the YouTube link for the song. Wave reads its title and artist, and looks up
            lyrics like any other song.
          </p>
          <div className="clip-link">
            <label>
              <Link2 size={16} aria-hidden="true" />
              <span className="sr-only">YouTube link</span>
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
              {pending ? 'Adding…' : 'Add song'}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="add-music-footer">
            <button type="button" className="text-button" onClick={() => setMode('choose')}>
              Back
            </button>
          </div>
        </>
      )}
      <p className="add-music-note">
        {mode === 'youtube'
          ? 'Only the link is sent. Audio is never downloaded.'
          : 'Your files stay on this device.'}
      </p>
    </Modal>
  );
}
