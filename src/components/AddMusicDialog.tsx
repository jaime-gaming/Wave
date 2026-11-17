import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderSearch, Link2, Plus, Search, Video } from './Glyphs';
import { Modal } from './Modal';
import { networkAriaLabel, networkLabel, useOnline } from '../ui/network';
import { formatTime, type Track } from '../domain/types';
import { parseYouTubeLink } from '../domain/youtube';
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
/**
 * "Add music" offers three ways to add songs:
 * - **From this device**: individual music files.
 * - **A whole folder**: reads folders recursively on this device.
 * - **From YouTube**: unified search-or-link input that finds songs fast or
 *   imports a pasted YouTube song or playlist link directly.
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
  onYouTube: (
    link: string,
    prefilled?: { title?: string; artist?: string; duration?: number; thumbnail?: string },
  ) => Promise<{ ok: boolean; error?: string; track?: Track }>;
  onAdded: (track: Track) => void;
  busy?: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<'choose' | 'youtube'>('choose');
  const [link, setLink] = useState('');
  const [pending, setPending] = useState(false);
  const [addingId, setAddingId] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [results, setResults] = useState<YouTubeCatalogResult[]>([]);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const online = useOnline();
  const [folders, setFolders] = useState<RememberedFolder[]>([]);
  const [folderBusy, setFolderBusy] = useState('');
  const [folderError, setFolderError] = useState('');
  // The picker is preferred, but never at the cost of a dead button: inside a
  // frame, or where the API is missing, the folder input does the same job.
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
    void rememberedFolders().then((saved) => {
      if (live) setFolders(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  // Fast debounced live search whenever the unified input contains a search query (not a link).
  useEffect(() => {
    searchAbort.current?.abort();
    searchAbort.current = null;
    if (mode !== 'youtube' || !online || looksLikeUrl || trimmedInput.length < 2) {
      return;
    }
    const controller = new AbortController();
    searchAbort.current = controller;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchDone(false);
      void searchYouTubeCatalog(trimmedInput, { signal: controller.signal, limit: 8 }).then(
        (items) => {
          if (controller.signal.aborted) return;
          setResults(items);
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

  const addCandidate = async (candidate: YouTubeCatalogResult) => {
    if (pending || addingId) return;
    setAddingId(candidate.videoId);
    setPending(true);
    setError('');
    const result = await onYouTube(`https://youtu.be/${candidate.videoId}`, {
      title: candidate.title,
      artist: candidate.artist,
      duration: candidate.duration,
      thumbnail: candidate.thumbnail,
    });
    setPending(false);
    setAddingId('');
    if (!result.ok || !result.track) {
      setError(result.error ?? t('That song could not be added.'));
      return;
    }
    onAdded(result.track);
    onClose();
  };

  const runSearchNow = async () => {
    if (!trimmedInput || trimmedInput.length < 2 || !online) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchDone(false);
    setError('');
    const items = await searchYouTubeCatalog(trimmedInput, {
      signal: controller.signal,
      limit: 8,
    });
    if (controller.signal.aborted) return;
    setResults(items);
    setSearching(false);
    setSearchDone(true);
  };

  const submit = async () => {
    if (!trimmedInput || pending) return;
    if (!looksLikeUrl) {
      if (results.length > 0 && searchDone) {
        await addCandidate(results[0]);
      } else {
        await runSearchNow();
      }
      return;
    }
    setPending(true);
    setError('');
    const result = await onYouTube(trimmedInput);
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
              <span>{online ? t('Search or paste a link.') : t('Needs a connection.')}</span>
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
                placeholder={t('Search a song or paste a YouTube link')}
                value={link}
                onChange={(event) => {
                  const next = event.target.value;
                  setLink(next);
                  setError('');
                  const nextTrim = next.trim();
                  const nextUrl =
                    !!parseYouTubeLink(nextTrim) ||
                    /^(?:https?:\/\/|(?:www\.|m\.|music\.)?youtube\.com|youtu\.be)/iu.test(
                      nextTrim,
                    );
                  if (!nextTrim || nextUrl || nextTrim.length < 2) {
                    setSearching(false);
                    setSearchDone(false);
                    if (!nextTrim || nextUrl) setResults([]);
                  }
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
            <button type="button" className="text-button" onClick={() => setMode('choose')}>
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
    </Modal>
  );
}
