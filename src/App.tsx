import type { MixSelection } from './components/DailyMixPage';
import { LocalMetadataReview } from './components/LocalMetadataReview';
import { ContextMenu, type ContextAction } from './components/ContextMenu';
import { MusicLighting } from './components/MusicLighting';
import { QueuePanel } from './components/QueuePanel';
import { useInteractionRipples } from './hooks/useInteractionRipples';
import { StartupAnimation } from './components/StartupAnimation';
import { useMusicEnergy } from './hooks/useMusicEnergy';
import { SearchPage } from './components/SearchPage';
import { RemixPage } from './components/RemixPage';
import { useListeningHistory } from './hooks/useListeningHistory';
import { LibraryMaintenance } from './components/LibraryMaintenance';
import { useAutomaticLyrics } from './hooks/useAutomaticLyrics';
import { StorageSettings } from './components/StorageSettings';
import { useCustomizations } from './hooks/useCustomizations';
import { ArtistEditor } from './components/ArtistEditor';
import { LyricsEditor } from './components/LyricsEditor';
import { ReorderSongs } from './components/ReorderSongs';
import { orderedTracks } from './domain/order';
import type { ArtistProfile } from './domain/types';
import { LibrarySurface } from './components/LibrarySurface';
import { HomePage } from './components/HomePage';
import { Artists, ArtistHeader } from './components/Artists';
import { albumKey, collectAlbums, collectArtists } from './domain/collections';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { MotionPreference, useWaveMotion } from './ui/motion';
import { usePlaylists } from './hooks/usePlaylists';
import { PlaylistCollection, PlaylistHeader } from './components/PlaylistCollection';
import { PlaylistDialog, AddSongsDialog, AddToPlaylistDialog } from './components/PlaylistDialog';
import { TrackEditor } from './components/TrackEditor';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Music2,
  Disc3,
  Users,
  ArrowUpRight,
  Check,
  ChevronDown,
  FolderOpen,
  ListMusic,
  Heart,
  Pencil,
  ArrowUp,
  ArrowDown,
  Film,
  Trash2,
  Play,
  Pause,
  SkipForward,
  Plus,
  Settings,
  Shuffle,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useLibrary } from './hooks/useLibrary';
import { useAppPalette } from './hooks/useAppPalette';
import { usePlayer } from './hooks/usePlayer';

/*
 * Views that most sessions never open are downloaded when they are first
 * needed, so the first screen on a phone is not paying for the settings page,
 * the metadata review or a daily mix.
 */
const DevicesPage = lazy(() =>
  import('./components/DevicesPage').then((module) => ({ default: module.DevicesPage })),
);
const SettingsPage = lazy(() =>
  import('./components/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const DailyMixPage = lazy(() =>
  import('./components/DailyMixPage').then((module) => ({ default: module.DailyMixPage })),
);
import { Artwork } from './components/Artwork';
import { LibraryContent } from './components/LibraryContent';
import { Navigation, type Page } from './components/Navigation';
import { Modal } from './components/Modal';
import { AndroidAppSheet } from './components/AndroidAppSheet';
import {
  isAndroidBrowser,
  isStandalone,
  promptAlreadyAnswered,
  rememberPromptAnswer,
} from './ui/androidApp';
import { PlayerBar } from './components/PlayerBar';
import { getClip, loadClips, removeClip } from './domain/videoClips';
import { AddMusicDialog } from './components/AddMusicDialog';
import { extendedLyricsEnabled, setExtendedLyrics } from './services/lyricsExtra';
import { AUDIO_ACCEPT } from './data/import';
import { shuffleQueue } from './domain/player';
import { filterTracks, type LibraryView, type Track } from './domain/types';

type Theme = 'dark' | 'light' | 'system';
function readFlag(key: string, fallback = false): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('wave-theme');
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const [animations, setAnimations] = useState(() => readFlag('wave-animations-enabled', true));
  return (
    <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
      <MotionPreference.Provider value={animations}>
        <WaveApp animations={animations} onAnimations={setAnimations} />
      </MotionPreference.Provider>
    </MotionConfig>
  );
}

function WaveApp({
  animations,
  onAnimations,
}: {
  animations: boolean;
  onAnimations: (value: boolean) => void;
}) {
  const library = useLibrary();
  const [automaticLyrics, setAutomaticLyrics] = useState(
    () => readFlag('wave-lyrics-consent-v1') && readFlag('wave-auto-lyrics'),
  );
  const [videoClip, setVideoClip] = useState(() => readFlag('wave-video-clip'));
  const [wordSources, setWordSources] = useState(extendedLyricsEnabled);
  useEffect(() => {
    try {
      localStorage.setItem('wave-video-clip', String(videoClip));
    } catch {
      /* Session-only options. */
    }
  }, [videoClip]);
  useEffect(() => {
    try {
      localStorage.setItem('wave-auto-lyrics', String(automaticLyrics));
    } catch {
      /* Session-only option. */
    }
  }, [automaticLyrics]);
  const collections = usePlaylists();
  const customizations = useCustomizations();
  const artistPhotos = useMemo(
    () => new Map(customizations.artists.map((profile) => [profile.name, profile.artwork])),
    [customizations.artists],
  );
  const [editingArtist, setEditingArtist] = useState<ArtistProfile | null>(null);
  const [editingLyrics, setEditingLyrics] = useState<Track | null>(null);
  const [reordering, setReordering] = useState<{
    kind: 'album' | 'playlist';
    id: string;
    name: string;
    tracks: Track[];
  } | null>(null);
  const [addingQueue, setAddingQueue] = useState(false);
  const animation = useWaveMotion();
  useInteractionRipples();
  const player = usePlayer(library.tracks, !library.loading);
  useAppPalette(
    player.state.playing ? player.current?.artwork : undefined,
    player.state.playing ? player.blend : null,
  );
  useMusicEnergy(player);
  const lookup = useAutomaticLyrics(
    library.tracks,
    automaticLyrics,
    library.loading || !!library.progress || !!editingLyrics,
    library.acceptLyrics,
    player.current?.id,
  );
  const acceptDuration = library.acceptDuration;
  const decodedDuration = player.duration,
    currentDuration = player.current?.duration,
    currentId = player.current?.id;
  useEffect(() => {
    if (
      currentId &&
      player.durationTrackId === currentId &&
      Number.isFinite(decodedDuration) &&
      decodedDuration > 0 &&
      Math.abs((currentDuration ?? 0) - decodedDuration) > 0.25
    )
      void acceptDuration(currentId, decodedDuration);
  }, [decodedDuration, currentDuration, currentId, player.durationTrackId, acceptDuration]);
  const { dispatch } = player;
  /**
   * A pairing link opens straight into Settings → Devices. The link is a QR
   * code someone scanned or a URL they opened, and landing on Home would leave
   * them to find the page themselves.
   */
  const [pairLink] = useState(() => /(?:#|&|\?)wave-pair=/u.test(location.hash + location.search));
  const [page, setPage] = useState<Page>(pairLink ? 'settings' : 'home');
  const [dailySelection, setDailySelection] = useState<MixSelection | null>(null);
  const [view, setView] = useState<LibraryView>('songs');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [group, setGroup] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  /**
   * A phone browsing the web is offered the Android app once. It is asked after
   * the interface has settled, so the first thing on screen is still the music,
   * and never on a device that answered already or that already runs the app.
   */
  const [androidSheet, setAndroidSheet] = useState(false);
  useEffect(() => {
    if (!isAndroidBrowser(undefined, isStandalone()) || promptAlreadyAnswered()) return;
    const timer = setTimeout(() => setAndroidSheet(true), 4_000);
    return () => clearTimeout(timer);
  }, []);
  /**
   * What was actually listened to, written as each play passes its threshold.
   * The page and the Home row both read from one summary, so a song cannot be
   * in one and missing from the other.
   */
  const listening = useListeningHistory({
    track: player.current,
    playing: player.state.playing && !player.buffering,
    duration: player.duration,
    readTime: player.readTime,
    tracks: library.tracks,
  });
  const [playerOpen, setPlayerOpen] = useState(false);
  const playerOpener = useRef<HTMLElement | null>(null);
  const settingsPrevious = useRef<Page>('home');
  const settingsOpener = useRef<HTMLElement | null>(null);
  const openSettings = () => {
    if (page !== 'settings') settingsPrevious.current = page;
    settingsOpener.current = document.activeElement as HTMLElement;
    setPage('settings');
  };
  const closeSettings = () => {
    setPage(settingsPrevious.current);
    requestAnimationFrame(() => settingsOpener.current?.focus({ preventScroll: true }));
  };
  const [removeTarget, setRemoveTarget] = useState<Track | null>(null);
  const [removing, setRemoving] = useState(false);
  const [context, setContext] = useState<{
    x: number;
    y: number;
    trackId?: string;
    opener?: HTMLElement;
  } | null>(null);
  const [trackOptions, setTrackOptions] = useState<Track | null>(null);
  const clipsForOptions = useMemo(() => (trackOptions ? loadClips() : {}), [trackOptions]);
  const [editorEnabled, setEditorEnabled] = useState(() => readFlag('wave-editor-enabled'));
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [playlistForm, setPlaylistForm] = useState<'new' | 'edit' | null>(null);
  const [addingSongs, setAddingSongs] = useState(false);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [pendingPlaylistTrack, setPendingPlaylistTrack] = useState<Track | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const selectedPlaylist = collections.playlists.find((playlist) => playlist.id === playlistId);
  const [largeText, setLargeText] = useState(() => readFlag('wave-large-text'));
  useEffect(() => {
    document.documentElement.dataset.textSize = largeText ? 'large' : 'standard';
    try {
      localStorage.setItem('wave-large-text', String(largeText));
    } catch {
      /* Session-only text size. */
    }
  }, [largeText]);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [dragging, setDragging] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const categoryStrip = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
    };
    update();
    media.addEventListener('change', update);
    try {
      localStorage.setItem('wave-theme', theme);
    } catch {
      /* Use the theme for this session if storage is blocked. */
    }
    return () => media.removeEventListener('change', update);
  }, [theme]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setPage('search');
        setPlaylistId(null);
        setView('songs');
        setGroup(null);
        searchInput.current?.focus();
        return;
      }
      const target = event.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        dispatch({ type: 'toggle' });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [dispatch]);

  useEffect(() => {
    if (page === 'search') searchInput.current?.focus();
  }, [page]);

  useEffect(() => {
    const centerSelection = () => {
      const strip = categoryStrip.current;
      const selected = strip?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!strip || !selected || strip.scrollWidth <= strip.clientWidth) return;
      const left =
        strip.scrollLeft +
        selected.getBoundingClientRect().left -
        strip.getBoundingClientRect().left;
      strip.scrollTo({
        left: left - (strip.clientWidth - selected.offsetWidth) / 2,
        behavior: animation.enabled ? 'smooth' : 'auto',
      });
    };
    centerSelection();
    window.addEventListener('resize', centerSelection);
    return () => window.removeEventListener('resize', centerSelection);
  }, [view, page, animation.enabled]);

  useEffect(() => {
    document.documentElement.dataset.motion = animations ? 'full' : 'reduced';
    try {
      localStorage.setItem('wave-editor-enabled', String(editorEnabled));
      localStorage.setItem('wave-animations-enabled', String(animations));
    } catch {
      /* Preferences remain usable for this session. */
    }
  }, [editorEnabled, animations]);

  const visible = useMemo(() => {
    const ordered = selectedPlaylist
      ? selectedPlaylist.trackIds.flatMap(
          (id) => library.tracks.find((track) => track.id === id) ?? [],
        )
      : library.tracks;
    let tracks = filterTracks(ordered, query);
    if (view === 'favorites') tracks = tracks.filter((track) => track.favorite);
    if (group)
      tracks = tracks.filter((track) =>
        view === 'artists' ? track.artist === group : albumKey(track) === group,
      );
    if (selectedPlaylist && sort === 'playlist') return tracks;
    if (view === 'albums' && group && sort === 'album')
      return orderedTracks(
        tracks,
        customizations.albums.find((order) => order.id === group)?.trackIds,
      );
    return [...tracks].sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'artist'
          ? a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
          : b.addedAt - a.addedAt,
    );
  }, [library.tracks, query, view, group, sort, selectedPlaylist, customizations.albums]);
  const albums = useMemo(() => collectAlbums(library.tracks), [library.tracks]);
  const artists = useMemo(() => collectArtists(library.tracks), [library.tracks]);
  const selectedArtist =
    group && view === 'artists'
      ? (artists.find((artist) => artist.name === group) ?? {
          name: group,
          tracks: [],
          albums: [],
          duration: 0,
        })
      : undefined;
  const favoriteCount = library.tracks.filter((track) => track.favorite).length;
  /**
   * The line under the page title.
   *
   * It says what the page is looking at, in the library's own numbers, and it is
   * the reason the header has a second line at all: a title alone leaves a band
   * of empty page under it. Nothing here is a status or a build note.
   */
  const pageSummary =
    page === 'search'
      ? 'Songs, albums and artists on this device'
      : page === 'settings'
        ? 'Playback, appearance, lyrics and storage'
        : page === 'remix'
          ? 'The songs you played this week'
          : page === 'library' && view !== 'songs'
            ? `${library.tracks.length} ${library.tracks.length === 1 ? 'song' : 'songs'} in your library`
            : `${library.tracks.length} ${library.tracks.length === 1 ? 'song' : 'songs'} · ${albums.length} ${albums.length === 1 ? 'album' : 'albums'}`;
  const busy = library.loading || !!library.progress;
  const chooseFiles = useCallback(() => input.current?.click(), []);
  const [addOpen, setAddOpen] = useState(false);
  /**
   * Every "Add music" in the app opens the same chooser.
   *
   * A button that jumps straight to the file picker decides for the listener
   * that what they want is a file on this device; a YouTube song is the other
   * half of what Wave can add, so the two are always offered together.
   */
  const openAddMusic = useCallback(() => setAddOpen(true), []);
  const [addBusy, setAddBusy] = useState(false);
  /** YouTube songs are added to the library and start playing straight away. */
  const addFromYouTube = useCallback(
    async (link: string) => {
      setAddBusy(true);
      const result = await library.addYouTube(link);
      setAddBusy(false);
      return result;
    },
    [library],
  );
  const playAdded = useCallback(
    (track: Track) => {
      player.play([...library.tracks.filter((item) => item.id !== track.id), track], track.id);
    },
    [library.tracks, player],
  );
  const clearSearch = useCallback(() => setQuery(''), []);
  const toggleFavorite = library.toggleFavorite;
  const favoriteTrack = useCallback((track: Track) => void toggleFavorite(track), [toggleFavorite]);
  const importFiles = (files: File[]) => {
    setNoticeVisible(true);
    void library.importFiles(files);
  };
  const error = library.error || collections.error || customizations.error || player.error;
  const changeView = useCallback((next: LibraryView) => {
    setView(next);
    setGroup(null);
    setPlaylistId(null);
    setSort((current) => (current === 'playlist' || current === 'album' ? 'recent' : current));
  }, []);
  const openPlaylist = useCallback((id: string) => {
    setPage('library');
    setView('playlists');
    setPlaylistId(id);
    setGroup(null);
    setQuery('');
    setSort('playlist');
  }, []);
  const changePage = (next: Page) => {
    setDailySelection(null);
    setPage(next);
    setPlaylistId(null);
    setGroup(null);
    setQuery('');
    setView('songs');
    if (next === 'home') setSort('recent');
  };
  const browse = useCallback(
    (next: LibraryView) => {
      setPage('library');
      setQuery('');
      changeView(next);
    },
    [changeView],
  );
  const openAlbum = useCallback(
    (id: string) => {
      browse('albums');
      setGroup(id);
      setSort('album');
    },
    [browse],
  );
  const chooseGroup = useCallback(
    (id: string | null) => {
      setGroup(id);
      if (view === 'albums') setSort(id ? 'album' : 'recent');
    },
    [view],
  );
  const openArtist = useCallback(
    (name: string) => {
      browse('artists');
      setGroup(name);
    },
    [browse],
  );
  const openPlayer = useCallback((opener: HTMLButtonElement) => {
    playerOpener.current = opener;
    setPlayerOpen(true);
  }, []);
  const shuffleCollection = (tracks: Track[]) => {
    if (!tracks.length) return;
    const first = tracks[Math.floor(Math.random() * tracks.length)].id;
    const queue = shuffleQueue(
      tracks.map((track) => track.id),
      first,
    );
    player.play(tracks, first);
    dispatch({ type: 'shuffle', queue });
  };
  const playAlbumTrack = useCallback((track: Track) => openAlbum(albumKey(track)), [openAlbum]);
  const createPlaylist = useCallback(() => setPlaylistForm('new'), []);
  const playShuffle = () => shuffleCollection(visible);

  const contextTrack = context?.trackId
    ? library.tracks.find((track) => track.id === context.trackId)
    : undefined;
  const contextActions: ContextAction[] = contextTrack
    ? [
        {
          label: 'Play song',
          icon: <Play size={18} />,
          run: () =>
            player.play(
              player.state.queue.includes(contextTrack.id)
                ? player.state.queue
                    .map((id) => library.tracks.find((t) => t.id === id))
                    .filter((t): t is Track => !!t)
                : visible.some((t) => t.id === contextTrack.id)
                  ? visible
                  : [contextTrack],
              contextTrack.id,
            ),
        },
        {
          label: player.state.queue.includes(contextTrack.id) ? 'Already in queue' : 'Add to queue',
          icon: <Plus size={18} />,
          disabled: player.state.queue.includes(contextTrack.id),
          run: () => player.enqueue([contextTrack.id]),
        },
        {
          label: contextTrack.favorite ? 'Remove from favorites' : 'Add to favorites',
          icon: <Heart size={18} />,
          run: () => void library.toggleFavorite(contextTrack),
        },
        {
          label: 'Add to playlist',
          icon: <ListMusic size={18} />,
          run: () => setAddingTrack(contextTrack),
        },
        {
          label: 'Edit lyrics',
          icon: <Pencil size={18} />,
          run: () => setEditingLyrics(contextTrack),
        },
        {
          label: 'Song options',
          icon: <SlidersHorizontal size={18} />,
          run: () => setTrackOptions(contextTrack),
        },
      ]
    : [
        {
          label: player.state.playing ? 'Pause' : 'Play',
          icon: player.state.playing ? <Pause size={18} /> : <Play size={18} />,
          disabled: !player.current,
          run: () => dispatch({ type: 'toggle' }),
        },
        {
          label: 'Next song',
          icon: <SkipForward size={18} />,
          disabled: !player.current,
          run: () => dispatch({ type: 'next' }),
        },
        { label: 'Playback queue', icon: <ListMusic size={18} />, run: () => setQueueOpen(true) },
        { label: 'Import music', icon: <Plus size={18} />, disabled: busy, run: chooseFiles },
        { label: 'Settings', icon: <Settings size={18} />, run: openSettings },
      ];

  return (
    <div
      className={`app-shell ${player.current ? 'has-current-track' : 'without-track'}`}
      onContextMenu={(event) => {
        const target = event.target;
        if (
          (event.shiftKey && event.button === 2) ||
          !(target instanceof Element) ||
          target.closest(
            'input,textarea,select,[contenteditable]:not([contenteditable="false"]),a[href],.context-menu',
          ) ||
          window.getSelection()?.toString()
        )
          return;
        const dialog = target.closest('dialog');
        if (dialog && !dialog.matches('.player-modal,.queue-sheet')) return;
        event.preventDefault();
        let x = event.clientX,
          y = event.clientY;
        if (!x && !y) {
          const box = target.getBoundingClientRect();
          x = box.left + box.width / 2;
          y = box.bottom;
        }
        setContext({
          x,
          y,
          trackId: target.closest<HTMLElement>('[data-track-id]')?.dataset.trackId,
          opener:
            target.closest<HTMLElement>('button,[tabindex]') ??
            target.closest('[data-track-id]')?.querySelector<HTMLButtonElement>('button') ??
            (document.activeElement instanceof HTMLElement ? document.activeElement : undefined),
        });
      }}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        importFiles([...event.dataTransfer.files]);
      }}
    >
      <a className="skip-link" href="#main">
        Skip to library
      </a>
      <input
        ref={input}
        className="file-input"
        aria-label="Import audio files"
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        disabled={busy}
        onChange={(event) => {
          importFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      {context && (
        <ContextMenu
          x={context.x}
          y={context.y}
          title={contextTrack?.title ?? 'Wave'}
          actions={contextActions}
          returnFocus={context.opener}
          onClose={() => setContext(null)}
        />
      )}
      <StartupAnimation loading={library.loading} />
      <MusicLighting className="music-backdrop" />
      <Navigation
        page={page}
        onPage={changePage}
        onSettings={openSettings}
        view={view}
        onView={browse}
        counts={{
          albums: albums.length,
          artists: artists.length,
          playlists: collections.playlists.length,
          favorites: favoriteCount,
        }}
      />
      <main id="main" tabIndex={-1} className={`workspace ${page}-page`}>
        <header className="library-header">
          {/* One banner: what this page is on the left, the two utilities on
              the right, both on the same line. There is no separate row for the
              buttons, so the header cannot leave an empty band behind. */}
          <div className="title-row">
            <div>
              <h1>
                {page === 'home'
                  ? dailySelection
                    ? 'Daily mixes'
                    : 'Home'
                  : page === 'search'
                    ? 'Search'
                    : page === 'settings'
                      ? 'Settings'
                      : page === 'remix'
                        ? 'Remix'
                        : 'Library'}
              </h1>
              <p className="library-summary">{pageSummary}</p>
            </div>
            <div className="header-actions">
              <button
                className="icon-button import-header"
                disabled={busy}
                onClick={() => setAddOpen(true)}
                aria-label="Add music"
              >
                <Plus size={24} />
              </button>
              <button
                className="icon-button settings-button"
                aria-label="Open settings"
                onClick={openSettings}
              >
                <Settings size={24} />
              </button>
            </div>
          </div>
          {page === 'library' && (
            <div ref={categoryStrip} className="library-tabs" aria-label="Browse library">
              {(
                [
                  { id: 'songs', label: 'Songs', icon: Music2, count: library.tracks.length },
                  { id: 'albums', label: 'Albums', icon: Disc3, count: albums.length },
                  { id: 'artists', label: 'Artists', icon: Users, count: artists.length },
                  {
                    id: 'playlists',
                    label: 'Playlists',
                    icon: ListMusic,
                    count: collections.playlists.length,
                  },
                  { id: 'favorites', label: 'Favorites', icon: Heart, count: favoriteCount },
                ] as const
              ).map((tab) => (
                <motion.button
                  whileTap={animation.enabled ? { scale: 0.95 } : undefined}
                  key={tab.id}
                  aria-pressed={view === tab.id}
                  aria-description={`${tab.count} items`}
                  className={view === tab.id ? 'active' : ''}
                  onClick={() => changeView(tab.id)}
                >
                  {view === tab.id && (
                    <motion.span
                      className="category-selection"
                      layoutId="library-category"
                      transition={animation.fast}
                    />
                  )}
                  <tab.icon size={19} aria-hidden="true" />
                  <span className="category-name">{tab.label}</span>
                  <span className="category-count" aria-hidden="true">
                    {tab.count}
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <LibrarySurface
            key={`${page}:${dailySelection?.mix.id ?? ''}:${view}:${group ?? ''}:${playlistId ?? ''}`}
          >
            {page === 'settings' ? (
              <Suspense fallback={<div className="empty-state" aria-busy="true" />}>
                <SettingsPage
                  initialSection={pairLink ? 'devices' : null}
                  onBack={closeSettings}
                  appearance={
                    <>
                      <div className="theme-options">
                        {(['dark', 'light', 'system'] as const).map((option) => (
                          <button
                            key={option}
                            className={theme === option ? 'chosen' : ''}
                            aria-pressed={theme === option}
                            onClick={() => setTheme(option)}
                          >
                            {option[0].toUpperCase() + option.slice(1)}
                            {theme === option && <Check size={18} />}
                          </button>
                        ))}
                      </div>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Larger text</strong>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Larger text"
                          aria-checked={largeText}
                          onClick={() => setLargeText(!largeText)}
                        >
                          <motion.span layout transition={animation.fast}>
                            {largeText && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Animations</strong>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Animations"
                          aria-checked={animations}
                          onClick={() => onAnimations(!animations)}
                        >
                          <motion.span layout transition={animation.fast}>
                            {animations && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                    </>
                  }
                  playback={
                    <>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Mix</strong>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Mix"
                          aria-checked={player.mixEnabled}
                          onClick={() => player.setMixEnabled(!player.mixEnabled)}
                        >
                          <motion.span layout transition={animation.fast}>
                            {player.mixEnabled && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Video clip</strong>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Video clip"
                          aria-checked={videoClip}
                          onClick={() => setVideoClip(!videoClip)}
                        >
                          <motion.span layout transition={animation.fast}>
                            {videoClip && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Autoplay</strong>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Autoplay"
                          aria-checked={player.autoplay}
                          onClick={() => player.setAutoplay(!player.autoplay)}
                        >
                          <motion.span layout transition={animation.fast}>
                            {player.autoplay && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                    </>
                  }
                  lyrics={
                    <>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Word-level lyric sources</strong>
                          <p className="settings-warning">
                            Unofficial sources. Only the title and artist are sent.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Word-level lyric sources"
                          aria-checked={wordSources}
                          onClick={() => {
                            const next = !wordSources;
                            setWordSources(next);
                            setExtendedLyrics(next);
                          }}
                        >
                          <motion.span layout transition={animation.fast}>
                            {wordSources && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                      <div className="settings-switch-row">
                        <div>
                          <strong>Automatic lyrics</strong>
                        </div>
                        <button
                          className="material-switch"
                          role="switch"
                          aria-label="Automatic lyrics"
                          aria-checked={automaticLyrics}
                          onClick={() => {
                            setAutomaticLyrics((value) => !value);
                            try {
                              localStorage.setItem('wave-lyrics-consent-v1', 'true');
                            } catch {
                              /* Session-only consent. */
                            }
                          }}
                        >
                          <motion.span layout transition={animation.fast}>
                            {automaticLyrics && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                    </>
                  }
                  library={
                    <>
                      {' '}
                      <div className="settings-switch-row">
                        <div>
                          <strong>Library editing</strong>
                        </div>
                        <button
                          type="button"
                          className="material-switch"
                          role="switch"
                          aria-label="Library editing"
                          aria-checked={editorEnabled}
                          onClick={() => setEditorEnabled(!editorEnabled)}
                        >
                          <motion.span layout transition={animation.fast}>
                            {editorEnabled && <Check size={15} />}
                          </motion.span>
                        </button>
                      </div>
                      <LocalMetadataReview tracks={library.tracks} />
                    </>
                  }
                  devices={
                    <DevicesPage
                      tracks={library.tracks}
                      onAddLoaned={async (blob, name) => {
                        await importFiles([new File([blob], name, { type: blob.type })]);
                      }}
                    />
                  }
                  storage={
                    <>
                      <LibraryMaintenance
                        tracks={library.tracks}
                        currentId={player.current?.id}
                        onMerged={async () => {
                          await library.reload();
                          await collections.reload();
                          await customizations.reload();
                        }}
                      />
                      <StorageSettings tracks={library.tracks} />
                    </>
                  }
                  about={
                    <>
                      <button
                        type="button"
                        className="settings-source"
                        onClick={() => setAndroidSheet(true)}
                      >
                        Wave for Android
                        <ArrowUpRight size={16} />
                      </button>
                      <a
                        className="settings-source"
                        href="https://github.com/jaime-gaming/Wave"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Wave {__WAVE_VERSION__} · Source code
                        <ArrowUpRight size={16} />
                      </a>
                    </>
                  }
                />
              </Suspense>
            ) : page === 'search' ? (
              <SearchPage
                tracks={library.tracks}
                playlists={collections.playlists}
                query={query}
                onQuery={setQuery}
                inputRef={searchInput}
                onCreatePlaylist={createPlaylist}
                photos={artistPhotos}
                loading={library.loading}
                busy={busy}
                currentId={player.current?.id}
                playing={player.state.playing}
                onPlay={player.play}
                onFavorite={favoriteTrack}
                onMore={setTrackOptions}
                onArtist={openArtist}
                onAlbum={openAlbum}
                onPlaylist={openPlaylist}
                onBrowse={browse}
                onAdd={openAddMusic}
              />
            ) : page === 'remix' ? (
              <RemixPage
                summary={listening.summary}
                recap={listening.recap}
                loaded={listening.loaded}
                currentId={player.current?.id}
                playing={player.state.playing}
                onPlay={player.play}
                onArtist={openArtist}
                onAdd={openAddMusic}
                onSave={async (songs) => {
                  // Saving is explicit: the list becomes an ordinary playlist and
                  // nothing about the history changes.
                  const saved = await collections.create(
                    {
                      name: `Remix · ${new Date().toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}`.slice(0, 100),
                      description: 'Saved from Remix, the songs you played most this week.',
                    },
                    songs.map((track) => track.id),
                  );
                  if (!saved) return false;
                  openPlaylist(saved.id);
                  return true;
                }}
                onClear={listening.forget}
              />
            ) : page === 'home' && dailySelection ? (
              <Suspense fallback={<div className="empty-state" aria-busy="true" />}>
                <DailyMixPage
                  selection={dailySelection}
                  tracks={library.tracks}
                  currentId={player.current?.id}
                  playing={player.state.playing}
                  onBack={() => setDailySelection(null)}
                  onPlay={player.play}
                  onShuffle={shuffleCollection}
                  onFavorite={favoriteTrack}
                  onMore={setTrackOptions}
                  onArtist={openArtist}
                  onAlbum={(track) => openAlbum(albumKey(track))}
                  onSave={async (songs) => {
                    const saved = await collections.create(
                      {
                        name: `Daily mix ${dailySelection.number} · ${dailySelection.mix.label}`.slice(
                          0,
                          100,
                        ),
                        description: `Saved from your local ${dailySelection.mix.basis}-based daily mix.`,
                      },
                      songs.map((t) => t.id),
                    );
                    if (!saved) return false;
                    openPlaylist(saved.id);
                    return true;
                  }}
                />
              </Suspense>
            ) : page === 'home' ? (
              <HomePage
                tracks={library.tracks}
                playlists={collections.playlists}
                current={player.current}
                playing={player.state.playing}
                loading={library.loading}
                busy={busy}
                onAdd={openAddMusic}
                onView={browse}
                onAlbum={openAlbum}
                onArtist={openArtist}
                onPlaylist={openPlaylist}
                onPlay={player.play}
                onFavorite={favoriteTrack}
                onMore={setTrackOptions}
                artistPhotos={artistPhotos}
                onMix={(mix, number) => setDailySelection({ mix, number })}
              />
            ) : view === 'artists' && !group ? (
              <Artists
                tracks={library.tracks}
                query={query}
                onOpen={openArtist}
                photos={artistPhotos}
                loading={library.loading}
              />
            ) : view === 'playlists' && !selectedPlaylist ? (
              collections.loading ? (
                <div className="empty-state">
                  <h2>Loading playlists</h2>
                </div>
              ) : (
                <PlaylistCollection
                  playlists={collections.playlists}
                  tracks={library.tracks}
                  query={query}
                  onOpen={openPlaylist}
                  onCreate={() => setPlaylistForm('new')}
                />
              )
            ) : (
              <>
                {selectedArtist && (
                  <ArtistHeader
                    artist={selectedArtist}
                    photo={artistPhotos.get(selectedArtist.name)}
                    onEditPhoto={() =>
                      setEditingArtist({
                        name: selectedArtist.name,
                        artwork: artistPhotos.get(selectedArtist.name),
                      })
                    }
                    onPlay={() => {
                      if (selectedArtist.tracks.length)
                        player.play(selectedArtist.tracks, selectedArtist.tracks[0].id);
                    }}
                    onShuffle={() => shuffleCollection(selectedArtist.tracks)}
                    onBack={() => {
                      setGroup(null);
                      setQuery('');
                    }}
                    onAlbum={openAlbum}
                  />
                )}
                {selectedPlaylist && (
                  <PlaylistHeader
                    playlist={selectedPlaylist}
                    tracks={library.tracks}
                    onBack={() => {
                      setPlaylistId(null);
                      setQuery('');
                    }}
                    onEdit={() => setPlaylistForm('edit')}
                    onAdd={() => setAddingSongs(true)}
                    onDelete={() => setDeletingPlaylist(true)}
                  />
                )}
                {!group && !selectedPlaylist && (view === 'songs' || view === 'favorites') && (
                  <div className="library-list-title">
                    <h2>{view === 'favorites' ? 'Favorite songs' : 'All songs'}</h2>
                  </div>
                )}
                <div className="library-toolbar">
                  <div className="library-play-actions">
                    <button
                      className="tonal-button shuffle-all"
                      aria-label="Shuffle all songs"
                      disabled={!visible.length}
                      onClick={playShuffle}
                    >
                      <Shuffle size={20} />
                      Shuffle
                    </button>
                    <button
                      className="icon-button play-all"
                      aria-label="Play all songs"
                      disabled={!visible.length}
                      onClick={() => player.play(visible, visible[0].id)}
                    >
                      <Play size={21} />
                    </button>
                    <span className="result-count">
                      {query
                        ? `${visible.length} results`
                        : view === 'favorites'
                          ? `${favoriteCount} favorites`
                          : `${visible.length} ${visible.length === 1 ? 'song' : 'songs'}`}
                    </span>
                  </div>
                  {(selectedPlaylist || (view === 'albums' && group)) && (
                    <button
                      className="tonal-button reorder-collection"
                      onClick={() => {
                        const album = albums.find((item) => item.id === group);
                        const tracks = selectedPlaylist
                          ? selectedPlaylist.trackIds.flatMap(
                              (id) => library.tracks.find((track) => track.id === id) ?? [],
                            )
                          : orderedTracks(
                              album?.tracks ?? [],
                              customizations.albums.find((order) => order.id === group)?.trackIds,
                            );
                        setReordering({
                          kind: selectedPlaylist ? 'playlist' : 'album',
                          id: selectedPlaylist?.id ?? group!,
                          name: selectedPlaylist?.name ?? album?.name ?? 'Album',
                          tracks,
                        });
                      }}
                    >
                      Reorder songs
                    </button>
                  )}
                  <label className="sort-control">
                    <SlidersHorizontal size={20} />
                    <select
                      aria-label="Sort tracks"
                      value={sort}
                      onChange={(event) => setSort(event.target.value)}
                    >
                      {selectedPlaylist && <option value="playlist">Playlist order</option>}
                      {view === 'albums' && group && <option value="album">Album order</option>}
                      <option value="recent">Recently added</option>
                      <option value="title">Title A–Z</option>
                      <option value="artist">Artist A–Z</option>
                    </select>
                    <ChevronDown size={16} />
                  </label>
                </div>
                <LibraryContent
                  loading={library.loading}
                  tracks={visible}
                  total={library.tracks.length}
                  view={view}
                  query={query}
                  group={group}
                  hideGroupHeader={view === 'artists'}
                  onGroup={chooseGroup}
                  onClearSearch={clearSearch}
                  onAdd={openAddMusic}
                  busy={busy}
                  currentId={player.current?.id}
                  playing={player.state.playing}
                  onPlay={player.play}
                  onFavorite={favoriteTrack}
                  onMore={setTrackOptions}
                  onArtist={openArtist}
                  onAlbum={playAlbumTrack}
                />
              </>
            )}
          </LibrarySurface>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {androidSheet && (
          <AndroidAppSheet
            key="android-app"
            onDismiss={() => {
              rememberPromptAnswer('dismissed');
              setAndroidSheet(false);
            }}
            onKeepWeb={() => {
              rememberPromptAnswer('web');
              setAndroidSheet(false);
            }}
          />
        )}
      </AnimatePresence>
      <PlayerBar
        player={player}
        expanded={playerOpen}
        onArtist={(name) => {
          setPlayerOpen(false);
          openArtist(name);
        }}
        onAlbum={(track) => {
          setPlayerOpen(false);
          openAlbum(albumKey(track));
        }}
        onExpanded={setPlayerOpen}
        onOpen={openPlayer}
        returnFocusRef={playerOpener}
        onFavorite={favoriteTrack}
        onLyrics={setEditingLyrics}
        onSaveLyrics={library.saveLyrics}
        automaticLyrics={automaticLyrics}
        lyricsLoading={lookup.loading === player.current?.id}
        onRetryLyrics={lookup.retryTrack}
        queueOpen={queueOpen}
        onQueue={() => setQueueOpen(!queueOpen)}
        karaoke
        videoClip={videoClip}
        onToggleVideoClip={() => setVideoClip(!videoClip)}
      />
      <AnimatePresence>
        {addOpen && (
          <AddMusicDialog
            key="add-music"
            onClose={() => setAddOpen(false)}
            onLocal={chooseFiles}
            onYouTube={addFromYouTube}
            onAdded={playAdded}
            busy={busy || addBusy}
          />
        )}
        {queueOpen && (
          <Modal
            key="queue"
            title="Queue"
            className="queue-sheet"
            onClose={() => setQueueOpen(false)}
          >
            <QueuePanel
              player={player}
              tracks={library.tracks}
              onAdd={() => setAddingQueue(true)}
            />
          </Modal>
        )}

        {trackOptions && (
          <Modal
            key="song-options"
            title="Song options"
            className="song-options-modal"
            onClose={() => setTrackOptions(null)}
          >
            <div className="options-track">
              <Artwork track={trackOptions} />
              <div className="track-info">
                <strong>{trackOptions.title}</strong>
                <span>{trackOptions.artist}</span>
              </div>
            </div>
            <button
              className="options-action"
              onClick={() => {
                void library.toggleFavorite(trackOptions);
                setTrackOptions(null);
              }}
            >
              <Heart size={22} />
              {trackOptions.favorite ? 'Remove from favorites' : 'Add to favorites'}
            </button>
            <button
              className="options-action"
              onClick={() => {
                setAddingTrack(trackOptions);
                setTrackOptions(null);
              }}
            >
              <ListMusic size={22} />
              Add to playlist
            </button>
            <button
              className="options-action"
              disabled={player.state.queue.includes(trackOptions.id)}
              onClick={() => {
                player.enqueue([trackOptions.id]);
                setTrackOptions(null);
              }}
            >
              <Plus size={22} />
              {player.state.queue.includes(trackOptions.id) ? 'Already in queue' : 'Add to queue'}
            </button>
            <button
              className="options-action"
              onClick={() => {
                setEditingLyrics(trackOptions);
                setTrackOptions(null);
              }}
            >
              {' '}
              <Pencil size={22} />
              Edit lyrics
            </button>
            {trackOptions.videoId && (
              <a
                className="options-action"
                href={`https://www.youtube.com/watch?v=${trackOptions.videoId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ArrowUpRight size={22} />
                Open on YouTube
              </a>
            )}
            {!!getClip(trackOptions.id, clipsForOptions) && (
              <button
                className="options-action"
                onClick={() => {
                  removeClip(trackOptions.id);
                  setTrackOptions(null);
                }}
              >
                <Film size={22} />
                Remove video clip
              </button>
            )}
            {editorEnabled && (
              <button
                className="options-action"
                onClick={() => {
                  setEditingTrack(trackOptions);
                  setTrackOptions(null);
                }}
              >
                <Pencil size={22} />
                Edit song
              </button>
            )}
            {selectedPlaylist && (
              <>
                <button
                  className="options-action"
                  disabled={selectedPlaylist.trackIds.indexOf(trackOptions.id) <= 0}
                  onClick={async () => {
                    await collections.update(selectedPlaylist.id, {
                      type: 'move',
                      id: trackOptions.id,
                      direction: -1,
                    });
                    setTrackOptions(null);
                  }}
                >
                  <ArrowUp size={22} />
                  Move up in playlist
                </button>
                <button
                  className="options-action"
                  disabled={
                    selectedPlaylist.trackIds.indexOf(trackOptions.id) >=
                    selectedPlaylist.trackIds.length - 1
                  }
                  onClick={async () => {
                    await collections.update(selectedPlaylist.id, {
                      type: 'move',
                      id: trackOptions.id,
                      direction: 1,
                    });
                    setTrackOptions(null);
                  }}
                >
                  <ArrowDown size={22} />
                  Move down in playlist
                </button>
                <button
                  className="options-action"
                  onClick={async () => {
                    await collections.update(selectedPlaylist.id, {
                      type: 'remove',
                      id: trackOptions.id,
                    });
                    setTrackOptions(null);
                  }}
                >
                  <X size={22} />
                  Remove from playlist
                </button>
              </>
            )}
            <button
              className="options-action"
              onClick={() => {
                setRemoveTarget(trackOptions);
                setTrackOptions(null);
              }}
            >
              <Trash2 size={22} />
              Remove from library
            </button>
          </Modal>
        )}
        {removeTarget && (
          <Modal
            key="remove-track"
            title="Remove this track?"
            onClose={() => {
              if (!removing) setRemoveTarget(null);
            }}
          >
            <p className="modal-description">
              Remove “{removeTarget.title}” from your library and queue? The original file on your
              device won’t be changed.
            </p>
            <div className="modal-actions">
              <button
                className="tonal-button"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
              >
                Keep track
              </button>
              <button
                className="danger-button"
                disabled={removing}
                onClick={async () => {
                  setRemoving(true);
                  if (await library.remove(removeTarget.id)) {
                    dispatch({ type: 'remove', id: removeTarget.id });
                    collections.pruneTrack(removeTarget.id);
                    setRemoveTarget(null);
                  }
                  setRemoving(false);
                }}
              >
                Remove track
              </button>
            </div>
          </Modal>
        )}
        {editingArtist && (
          <ArtistEditor
            key={`artist-${editingArtist.name}`}
            profile={editingArtist}
            onSave={customizations.saveArtist}
            onClose={() => setEditingArtist(null)}
          />
        )}
        {editingLyrics && (
          <LyricsEditor
            key={`lyrics-${editingLyrics.id}`}
            track={editingLyrics}
            retryAt={library.tracks.reduce(
              (max, t) => Math.max(max, t.lyricsLookup?.retryAt ?? 0),
              0,
            )}
            onSave={library.saveLyrics}
            onClose={() => setEditingLyrics(null)}
          />
        )}
        {reordering && (
          <ReorderSongs
            key={`order-${reordering.id}`}
            tracks={reordering.tracks}
            name={reordering.name}
            onClose={() => setReordering(null)}
            onSave={async (ids) => {
              const success =
                reordering.kind === 'playlist'
                  ? await collections.update(reordering.id, { type: 'reorder', ids })
                  : await customizations.saveOrder(reordering.id, ids);
              if (success) setSort(reordering.kind === 'playlist' ? 'playlist' : 'album');
              return success;
            }}
          />
        )}
        {addingQueue && (
          <AddSongsDialog
            key="add-queue"
            title="Add songs to queue"
            destination="the queue"
            existingIds={player.state.queue}
            tracks={library.tracks}
            onAdd={async (ids) => {
              player.enqueue(ids);
              return true;
            }}
            onClose={() => setAddingQueue(false)}
          />
        )}
        {editingTrack && editorEnabled && (
          <TrackEditor
            key={`edit-${editingTrack.id}`}
            track={editingTrack}
            onClose={() => setEditingTrack(null)}
            onSave={library.editMetadata}
            onRestore={library.restoreMetadata}
          />
        )}
        {playlistForm && (
          <PlaylistDialog
            key="playlist-form"
            playlist={playlistForm === 'edit' ? selectedPlaylist : undefined}
            editorEnabled={editorEnabled}
            onClose={() => {
              setPlaylistForm(null);
              setPendingPlaylistTrack(null);
            }}
            onSave={async (details) => {
              if (playlistForm === 'edit' && selectedPlaylist)
                return collections.update(selectedPlaylist.id, { type: 'details', details });
              const saved = await collections.create(details);
              if (!saved) return false;
              if (
                pendingPlaylistTrack &&
                !(await collections.update(saved.id, {
                  type: 'add',
                  ids: [pendingPlaylistTrack.id],
                }))
              ) {
                openPlaylist(saved.id);
                return true;
              }
              openPlaylist(saved.id);
              return true;
            }}
          />
        )}
        {addingSongs && selectedPlaylist && (
          <AddSongsDialog
            key="add-songs"
            playlist={selectedPlaylist}
            tracks={library.tracks}
            onClose={() => setAddingSongs(false)}
            onAdd={(ids) => collections.update(selectedPlaylist.id, { type: 'add', ids })}
          />
        )}
        {addingTrack && (
          <AddToPlaylistDialog
            key="add-to-playlist"
            track={addingTrack}
            playlists={collections.playlists}
            tracks={library.tracks}
            onClose={() => setAddingTrack(null)}
            onAdd={(id) => collections.update(id, { type: 'add', ids: [addingTrack.id] })}
            onCreate={() => {
              setPendingPlaylistTrack(addingTrack);
              setAddingTrack(null);
              setPlaylistForm('new');
            }}
          />
        )}
        {deletingPlaylist && selectedPlaylist && (
          <Modal
            key="delete-playlist"
            title="Delete playlist?"
            onClose={() => {
              if (!removing) setDeletingPlaylist(false);
            }}
          >
            <p className="modal-description">
              Delete “{selectedPlaylist.name}”? Your songs will stay in the library.
            </p>
            <div className="modal-actions">
              <button
                className="tonal-button"
                disabled={removing}
                onClick={() => setDeletingPlaylist(false)}
              >
                Keep playlist
              </button>
              <button
                className="danger-button"
                disabled={removing}
                onClick={async () => {
                  setRemoving(true);
                  if (await collections.remove(selectedPlaylist.id)) {
                    setDeletingPlaylist(false);
                    setPlaylistId(null);
                  }
                  setRemoving(false);
                }}
              >
                Delete playlist
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
      {(error || (library.message && noticeVisible) || library.progress) && (
        <div className={`toast ${error ? 'error-toast' : ''}`} role={error ? 'alert' : 'status'}>
          <span>
            {error ||
              (library.progress
                ? `Importing ${library.progress.done} of ${library.progress.total} files…`
                : library.message)}
          </span>
          {!library.progress && (
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => {
                library.setError('');
                collections.setError('');
                customizations.setError('');
                player.setError('');
                setNoticeVisible(false);
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <FolderOpen size={48} />
          <h2>{busy ? 'Import in progress' : 'Add music'}</h2>
          <p>{busy ? 'Wait for this import to finish.' : 'Drop your audio files here.'}</p>
        </div>
      )}
    </div>
  );
}
