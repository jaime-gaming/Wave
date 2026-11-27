import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, FileUp, ListMusic, Upload } from './Glyphs';
import { Modal } from './Modal';
import { isLink, parsePlaylistText, type ParsedList } from '../domain/importFile';
import { parseImportLink } from '../domain/linkImport';
import { parseYouTubeLink, youtubeThumbnailUrl } from '../domain/youtube';
import { suggestedPlaylistName } from '../domain/playlistImport';
import { findPlaylistVideos, type YouTubeProposal } from '../services/playlistYouTube';
import {
  fetchVideoMeta,
  fetchYouTubePlaylist,
  type YouTubeCatalogResult,
} from '../services/videoMeta';
import type { Track } from '../domain/types';
import { useT } from '../i18n';

export function MigrationSheet({
  onSave,
  onAddVideo,
  onClose,
}: {
  tracks: Track[];
  onSave: (name: string, trackIds: string[]) => Promise<boolean>;
  onAddVideo: (video: YouTubeCatalogResult) => Promise<Track | null>;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [list, setList] = useState<ParsedList | null>(null);
  const [proposals, setProposals] = useState<YouTubeProposal[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [fromUrl, setFromUrl] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [editingMatch, setEditingMatch] = useState<number | null>(null);
  const [matchLink, setMatchLink] = useState('');
  const [matchError, setMatchError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const matchRequest = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  const fileRequest = useRef(0);
  useEffect(
    () => () => {
      request.current?.abort();
      matchRequest.current?.abort();
      fileRequest.current++;
    },
    [],
  );

  const inspect = async (raw: string, fromFile?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setSaved(false);
    setFromUrl(false);
    setReading(true);
    setProgress({ done: 0, total: 0 });
    try {
      let parsed: ParsedList;
      let direct: YouTubeProposal[] | undefined;
      if (isLink(raw)) {
        const link = parseImportLink(raw);
        if (!link.ok) {
          setError(t(link.message));
          return;
        }
        if (
          link.target.provider === 'youtube' &&
          (link.target.playlistId || link.target.kind === 'playlist')
        ) {
          const playlist = await fetchYouTubePlaylist(link.target.playlistId || link.target.id, {
            signal: controller.signal,
          });
          if (!playlist?.videos.length) throw new Error('link');
          parsed = {
            source: 'text',
            name: playlist.title,
            entries: playlist.videos.map((video, index) => ({
              id: `youtube-${index}`,
              title: video.title,
              artist: video.artist,
              duration: video.duration,
            })),
            skipped: 0,
            truncated: false,
          };
          direct = playlist.videos.map((video, index) => ({
            entry: parsed.entries[index],
            video: { ...video, rawTitle: video.title, author: video.artist },
            score: 1,
            accepted: true,
          }));
        } else {
          const response = await fetch('/api/import-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: raw.trim() }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
          });
          const payload = await response.json();
          if (!response.ok || typeof payload.text !== 'string') throw new Error('link');
          parsed = parsePlaylistText(payload.text);
          if (payload.partial === true) parsed.truncated = true;
        }
        setFromUrl(true);
      } else parsed = parsePlaylistText(raw);
      if (controller.signal.aborted) return;
      if (!parsed.entries.length) {
        setError(t('That text did not contain any songs Wave could read.'));
        return;
      }
      setProgress({ done: 0, total: parsed.entries.length });
      const result =
        direct ??
        (await findPlaylistVideos(parsed.entries, {
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        }));
      if (controller.signal.aborted) return;
      setList(parsed);
      setProposals(result);
      setName(parsed.name ?? suggestedPlaylistName(fromFile, 'the other app'));
      window.dispatchEvent(new CustomEvent('wave:feature-used', { detail: 'Playlist import' }));
    } catch {
      if (!controller.signal.aborted)
        setError(t('The public link could not be read. Try an exported playlist file instead.'));
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  };

  const closeMatchEditor = () => {
    matchRequest.current?.abort();
    setEditingMatch(null);
    setReplacing(false);
    setMatchError('');
  };
  const replaceMatch = async (index: number) => {
    const parsed = parseYouTubeLink(matchLink);
    if (!parsed || parsed.kind !== 'video') {
      setMatchError(t('Paste a valid YouTube video link.'));
      return;
    }
    const controller = new AbortController();
    matchRequest.current?.abort();
    matchRequest.current = controller;
    setReplacing(true);
    setMatchError('');
    try {
      const meta = await fetchVideoMeta(parsed.videoId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!meta) {
        setMatchError(t('That video could not be read. Check the link and try again.'));
        return;
      }
      const video: YouTubeCatalogResult = {
        ...meta,
        videoId: parsed.videoId,
        thumbnail: meta.thumbnail || youtubeThumbnailUrl(parsed.videoId),
      };
      setProposals(
        (current) =>
          current?.map((row, at) =>
            at === index ? { ...row, video, score: 1, accepted: true } : row,
          ) ?? null,
      );
      setEditingMatch(null);
    } catch {
      if (!controller.signal.aborted)
        setMatchError(t('That video could not be read. Check the link and try again.'));
    } finally {
      if (!controller.signal.aborted) setReplacing(false);
    }
  };

  const selected = proposals?.filter((item) => item.accepted && item.video) ?? [];
  const confirm = async () => {
    if (!selected.length || saveLock.current || editingMatch !== null) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    setProgress({ done: 0, total: selected.length });
    const ids: string[] = [];
    const byVideo = new Map<string, string>();
    let savingPlaylist = false;
    try {
      for (const item of selected) {
        const video = item.video!;
        let id = byVideo.get(video.videoId);
        if (!id) {
          const added = await onAddVideo(video);
          if (!added) throw new Error('track');
          id = added.id;
          byVideo.set(video.videoId, id);
        }
        ids.push(id);
        setProgress({ done: ids.length, total: selected.length });
      }
      const unique = [...new Set(ids)];
      savingPlaylist = true;
      const created = await onSave(name.trim() || t('Imported playlist'), unique);
      if (!created) throw new Error('playlist');
      setSavedCount(unique.length);
      setSaved(true);
    } catch (cause) {
      setError(
        savingPlaylist || (cause instanceof Error && cause.message === 'playlist')
          ? t('The playlist could not be saved. The songs already added remain in your library.')
          : t(
              'Some songs could not be saved. The songs already added remain in your library; please try again.',
            ),
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Bring your playlists over')}
      className="migration-sheet"
      closeDisabled={saving}
      onClose={onClose}
    >
      {saved ? (
        <div className="migration-done">
          <Check size={28} aria-hidden="true" />
          <h3>{t('Your playlist is ready')}</h3>
          <p>{t('{count} songs were added to the playlist.', { count: savedCount })}</p>
          <button className="filled-button" onClick={onClose}>
            {t('Back to playlists')}
          </button>
        </div>
      ) : !proposals || !list ? (
        <div className="migration-input">
          <p className="modal-description">
            {t(
              'Paste a public Spotify, YouTube or Deezer link, a song list, or choose an exported file.',
            )}
          </p>
          <p className="migration-hint">
            {t(
              'Wave searches YouTube for these songs. Titles and artists are sent for this search; audio is not downloaded.',
            )}
          </p>
          <label className="form-field">
            {t('Playlist, song list or link')}
            <textarea
              rows={5}
              disabled={reading}
              value={text}
              placeholder={'Artist - Title\nArtist - Another song'}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {reading && (
            <p role="status">
              {progress.total
                ? t('Searching for songs… {done} of {total}', progress)
                : t('Reading public link…')}
            </p>
          )}
          <div className="migration-actions">
            <button
              className="filled-button"
              disabled={reading || !text.trim()}
              onClick={() => void inspect(text, 'pasted list')}
            >
              <ListMusic size={18} aria-hidden="true" />
              {t('Read this list')}
            </button>
            <button
              className="tonal-button"
              disabled={reading}
              onClick={() => file.current?.click()}
            >
              <FileUp size={18} aria-hidden="true" />
              {t('Choose a file')}
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
                if (chosen.size > 8_000_000) {
                  setError(t('That file is too large to be a playlist.'));
                  return;
                }
                const token = ++fileRequest.current;
                setReading(true);
                setError('');
                try {
                  const content = await chosen.text();
                  if (token !== fileRequest.current) return;
                  setText(content);
                  void inspect(content, chosen.name.replace(/\.[a-z0-9]+$/iu, ''));
                } catch {
                  if (token !== fileRequest.current) return;
                  setReading(false);
                  setError(t('That file could not be read. Please try another file.'));
                }
              }}
            />
          </div>
          <p className="migration-hint">
            {t(
              'Private playlists need an exported file. Some providers only show part of a public list.',
            )}
          </p>
        </div>
      ) : (
        <div className="migration-review">
          {fromUrl && (
            <p className="migration-hint">
              {t(
                'Only the publicly visible songs could be read. The list may be incomplete; review before saving. No audio was downloaded.',
              )}
            </p>
          )}
          {(list.truncated || list.skipped > 0) && (
            <p className="migration-hint">
              {t('Some entries could not be read or exceeded the import limit.')}
            </p>
          )}
          <p>
            {t('{selected} of {total} songs ready', {
              selected: selected.length,
              total: proposals.length,
            })}
          </p>
          <p className="migration-hint">
            {t(
              'Check uncertain matches before including them. Unavailable songs are left out. Repeated songs are added once.',
            )}
          </p>
          <label className="form-field">
            {t('Name for the new playlist')}
            <input
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <ul className="migration-rows">
            {proposals.map((item, index) => (
              <li key={item.entry.id} className={item.accepted ? 'matched' : 'missing'}>
                {item.video ? (
                  <input
                    type="checkbox"
                    disabled={saving}
                    aria-label={t('Include {title}', { title: item.entry.title })}
                    checked={item.accepted}
                    onChange={(event) =>
                      setProposals(
                        (current) =>
                          current?.map((row, at) =>
                            at === index ? { ...row, accepted: event.target.checked } : row,
                          ) ?? null,
                      )
                    }
                  />
                ) : (
                  <span aria-hidden="true">–</span>
                )}
                <span>
                  <strong>{item.entry.title}</strong>
                  <small>
                    {item.entry.artist || t('Unknown artist')} ·{' '}
                    {item.video
                      ? `${item.video.artist} — ${item.video.title}${item.score < 0.82 ? ` · ${t('Check this match')}` : ''}`
                      : t('No suitable YouTube match found')}
                  </small>
                  <span className="migration-match-actions">
                    {item.video && (
                      <a
                        className="migration-review-link"
                        href={`https://www.youtube.com/watch?v=${item.video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('Open {title} on YouTube', { title: item.entry.title })}
                      >
                        {t('Open on YouTube')}
                      </a>
                    )}
                    {editingMatch !== index && (
                      <button
                        type="button"
                        className="text-button migration-change-match"
                        disabled={saving || replacing}
                        aria-label={t('Change match for {title}', { title: item.entry.title })}
                        onClick={() => {
                          closeMatchEditor();
                          setMatchLink('');
                          setEditingMatch(index);
                        }}
                      >
                        {t('Change match')}
                      </button>
                    )}
                  </span>
                  {editingMatch === index ? (
                    <span className="migration-match-editor">
                      <label className="form-field">
                        {t('YouTube video link for {title}', { title: item.entry.title })}
                        <input
                          value={matchLink}
                          disabled={replacing || saving}
                          onChange={(event) => {
                            setMatchLink(event.target.value);
                            setMatchError('');
                          }}
                        />
                      </label>
                      {matchError && (
                        <span className="form-error" role="alert">
                          {matchError}
                        </span>
                      )}
                      <span className="migration-actions">
                        <button
                          type="button"
                          className="tonal-button"
                          disabled={replacing || saving}
                          onClick={() => void replaceMatch(index)}
                        >
                          {replacing ? t('Reading public link…') : t('Use this video')}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={saving}
                          onClick={closeMatchEditor}
                        >
                          {t('Cancel')}
                        </button>
                      </span>
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {saving && (
            <p className="migration-hint" role="status">
              {t('Saving songs… {done} of {total}', progress)}
            </p>
          )}
          <div className="migration-actions">
            <button
              className="tonal-button"
              onClick={() => {
                setError('');
                setProposals(null);
              }}
              disabled={saving}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              {t('Back')}
            </button>
            <button
              className="filled-button"
              disabled={saving || replacing || editingMatch !== null || !selected.length}
              onClick={() => void confirm()}
            >
              <Upload size={18} aria-hidden="true" />
              {saving
                ? t('Saving…')
                : t('Create playlist with {count}', { count: selected.length })}
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
