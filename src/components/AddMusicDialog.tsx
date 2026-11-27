import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderSearch, Link2, Plus, Search, Video } from './Glyphs';
import { Modal } from './Modal';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import { formatTime, type Track } from '../domain/types';
import { parseYouTubeLink } from '../domain/youtube';
import { AUDIO_ACCEPT } from '../data/import';
import { searchYouTubeCatalog, type YouTubeCatalogResult } from '../services/videoMeta';
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

export function AddMusicDialog({
  onClose,
  onLocal,
  onFolderFiles,
  onYouTube,
  onAdded,
  busy = false,
  setup = false,
  inline = false,
  initialMode = 'choose',
  onYouTubeChoice,
}: {
  onClose: () => void;
  onLocal: () => void;

  onFolderFiles: (files: File[]) => void;
  onYouTube: (
    link: string,
    prefilled?: { title?: string; artist?: string; duration?: number; thumbnail?: string },
  ) => Promise<{ ok: boolean; error?: string; track?: Track }>;
  onAdded: (track: Track) => void;
  busy?: boolean;
  setup?: boolean;
  inline?: boolean;
  initialMode?: 'choose' | 'youtube';
  onYouTubeChoice?: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<'choose' | 'youtube'>(initialMode);
  const [link, setLink] = useState('');
  const [pending, setPending] = useState(false);
  const [addingId, setAddingId] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [results, setResults] = useState<YouTubeCatalogResult[]>([]);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  const localInput = useRef<HTMLInputElement>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const addLock = useRef(false);
  const online = useOnline();
  const [folders, setFolders] = useState<RememberedFolder[]>([]);
  const [folderBusy, setFolderBusy] = useState('');
  const [folderError, setFolderError] = useState('');

  const canPick = canShowFolderPicker();
  const canChooseDirectory = supportsDirectoryInput();

  const trimmedInput = link.trim();
  const parsedLink = trimmedInput ? parseYouTubeLink(trimmedInput) : null;
  const looksLikeUrl =
    !!parsedLink ||
    /^(?:https?:\/\/|(?:www\.|m\.|music\.)?youtube\.com|youtu\.be)/iu.test(trimmedInput);

  useEffect(() => {
    if (mode === 'youtube') input.current?.focus();
  }, [mode]);
  useEffect(() => {
    let live = true;
    void rememberedFolders()
      .then((saved) => {
        if (live) setFolders(saved);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    searchAbort.current?.abort();
    searchAbort.current = null;
    if (mode !== 'youtube' || !online || looksLikeUrl || trimmedInput.length < 2) {
      return;
    }
    const controller = new AbortController();
    searchAbort.current = controller;
    const timer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setSearching(true);
      setSearchDone(false);
      void searchYouTubeCatalog(trimmedInput, { signal: controller.signal, limit: 8 }).then(
        (items) => {
          if (controller.signal.aborted) return;
          setResults(items);
          setSearching(false);
          setSearchDone(true);
        },
        () => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearching(false);
          setSearchDone(true);
        },
      );
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, online, looksLikeUrl, trimmedInput]);

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

  const chooseFolder = async () => {
    if (canPick) {
      const pick = await pickFolder();
      if (pick.ok) return readGranted(pick.handle);
      if (pick.reason === 'cancelled') return;

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

  const addCandidate = async (candidate: YouTubeCatalogResult) => {
    if (addLock.current) return;
    addLock.current = true;
    setAddingId(candidate.videoId);
    setPending(true);
    setError('');
    try {
      const result = await onYouTube(`https://youtu.be/${candidate.videoId}`, {
        title: candidate.title,
        artist: candidate.artist,
        duration: candidate.duration,
        thumbnail: candidate.thumbnail,
      });
      if (!result.ok || !result.track) {
        setError(result.error ? t(result.error) : t('That song could not be added.'));
        return;
      }
      onAdded(result.track);
      onClose();
    } catch {
      setError(t('That song could not be added.'));
    } finally {
      addLock.current = false;
      setPending(false);
      setAddingId('');
    }
  };

  const runSearchNow = async () => {
    if (!trimmedInput || trimmedInput.length < 2 || !online) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchDone(false);
    setError('');
    try {
      const items = await searchYouTubeCatalog(trimmedInput, {
        signal: controller.signal,
        limit: 8,
      });
      if (controller.signal.aborted) return;
      setResults(items);
    } catch {
      if (controller.signal.aborted) return;
      setResults([]);
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
        setSearchDone(true);
      }
    }
  };

  const submit = async () => {
    if (!trimmedInput || addLock.current) return;
    if (!looksLikeUrl) {
      // Searching never silently adds the first (possibly wrong) match.
      await runSearchNow();
      return;
    }
    addLock.current = true;
    setPending(true);
    setError('');
    try {
      const result = await onYouTube(trimmedInput);
      if (!result.ok || !result.track) {
        setError(result.error ? t(result.error) : t('That link could not be added.'));
        return;
      }
      onAdded(result.track);
      onClose();
    } catch {
      setError(t('That link could not be added.'));
    } finally {
      addLock.current = false;
      setPending(false);
    }
  };

  const content = (
    <>
      {setup && (pending || folderBusy) ? (
        <div className="setup-import-wait" role="status">
          <h2>{t('Bringing your music in')}</h2>
          <p>{t('This can take a little while.')}</p>
          <div className="welcome-import-card">
            <div className="welcome-import-symbol" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <progress aria-label={t('Adding music')} />
          </div>
        </div>
      ) : (
        <>
          {mode === 'choose' ? (
            <>
              <div className="add-music-choices">
                <button
                  type="button"
                  className="add-music-choice"
                  title={t('From this device')}
                  aria-label={t('From this device')}
                  onClick={() => {
                    if (setup) localInput.current?.click();
                    else {
                      onClose();
                      onLocal();
                    }
                  }}
                  disabled={busy}
                >
                  <FolderOpen size={24} aria-hidden="true" />
                  <strong>{t(inline ? 'Files' : 'From this device')}</strong>
                  <span>{t('MP3, WAV, M4A, OGG, FLAC.')}</span>
                </button>
                <button
                  type="button"
                  className="add-music-choice"
                  onClick={() => void chooseFolder()}
                  disabled={busy || (!canPick && !canChooseDirectory)}
                  aria-label={t('Add a whole folder')}
                  title={t('Add a whole folder')}
                >
                  <FolderSearch size={24} aria-hidden="true" />
                  <strong>
                    {folderBusy
                      ? t('Reading {name}…', { name: folderBusy })
                      : t(inline ? 'Folder' : 'A whole folder')}
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
                  onClick={() => (onYouTubeChoice ? onYouTubeChoice() : setMode('youtube'))}
                  disabled={busy || !online}
                  aria-label={
                    networkAriaLabel(online, t('Add from YouTube')) ?? t('Add from YouTube')
                  }
                  title={networkAriaLabel(online, t('Add from YouTube'))}
                >
                  <Video size={24} aria-hidden="true" />
                  <strong>{inline ? t('YouTube') : networkLabel(online, t('From YouTube'))}</strong>
                  <span>{online ? t('Search or paste a link.') : t('Needs a connection.')}</span>
                </button>
              </div>
              {!inline && !!folders.length && (
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
                            setFolders((current) =>
                              current.filter((entry) => entry.id !== folder.id),
                            ),
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
              {setup && (
                <input
                  ref={localInput}
                  type="file"
                  multiple
                  hidden
                  accept={AUDIO_ACCEPT}
                  aria-label={t('Choose music files')}
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    event.target.value = '';
                    if (files.length) {
                      onFolderFiles(files);
                      onClose();
                    }
                  }}
                />
              )}
              <input
                ref={directory}
                type="file"
                multiple
                hidden

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
              <div className="clip-link yt-unified-input">
                <label>
                  {looksLikeUrl ? (
                    <Link2 size={16} aria-hidden="true" />
                  ) : (
                    <Search size={16} aria-hidden="true" />
                  )}
                  <span className="sr-only">{t('Search or paste a YouTube link')}</span>
                  <input
                    ref={input}
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    disabled={pending}
                    placeholder={t('Search a song or paste a YouTube link')}
                    value={link}
                    onChange={(event) => {
                      searchAbort.current?.abort();
                      setLink(event.target.value);
                      setError('');
                      setResults([]);
                      setSearching(false);
                      setSearchDone(false);
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
                  disabled={!trimmedInput || pending || (!looksLikeUrl && trimmedInput.length < 2)}
                >
                  {pending
                    ? t('Adding…')
                    : looksLikeUrl
                      ? parsedLink?.kind === 'playlist'
                        ? t('Add playlist')
                        : t('Add song')
                      : searching
                        ? t('Searching…')
                        : t('Search')}
                </button>
              </div>
              {!looksLikeUrl && (searching || results.length > 0 || searchDone) && (
                <div className="yt-search-results" role="region" aria-label={t('YouTube results')}>
                  {searching && !results.length ? (
                    <p className="yt-search-status">{t('Searching YouTube…')}</p>
                  ) : results.length > 0 ? (
                    <ul className="yt-search-list">
                      {results.map((item) => (
                        <li key={item.videoId}>
                          <button
                            type="button"
                            className="yt-search-row"
                            disabled={pending}
                            onClick={() => void addCandidate(item)}
                          >
                            <img
                              className="yt-search-thumb"
                              src={item.thumbnail}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                            <span className="yt-search-meta">
                              <strong>{item.title}</strong>
                              <small>
                                {item.artist}
                                {item.duration > 0 ? ` · ${formatTime(item.duration)}` : ''}
                              </small>
                            </span>
                            <span className="yt-search-add" aria-hidden="true">
                              {addingId === item.videoId ? t('Adding…') : <Plus size={16} />}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="yt-search-status">
                      {t('No matching songs found. Try another search or paste a YouTube link.')}
                    </p>
                  )}
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="add-music-footer">
                <button
                  type="button"
                  className="text-button"
                  disabled={pending}
                  onClick={() => setMode('choose')}
                >
                  {t('Back')}
                </button>
              </div>
            </>
          )}
          <p className="add-music-note">
            {mode === 'youtube'
              ? t('Search or paste a public YouTube link. Audio stays on YouTube.')
              : t('Your files stay on this device.')}
          </p>
        </>
      )}
    </>
  );
  if (inline) return content;
  return (
    <Modal
      title={t('Add music')}
      className={`add-music-modal ${setup && (pending || folderBusy) ? 'setup-import-modal' : ''}`}
      onClose={onClose}
      closeDisabled={!!pending || !!folderBusy}
    >
      {content}
    </Modal>
  );
}
