import { useLibraryClips } from './hooks/useLibraryClips';
import { dailyMixPlaylistName } from './domain/dailyMixes';
import { greetingFor, greetingGroup } from './domain/greetings';
import { inferListeningMood } from './domain/mood';
import { cachedAnalysis } from './audio/mixAnalysis';
import { useArtistPhotos } from './hooks/useArtistPhotos';
import { SurfaceLoading } from './components/SurfaceLoading';
import { VolumeSettings } from './components/VolumeSettings';
import { MaterialSwitch } from './components/MaterialSwitch';
import { useVolumeFix } from './hooks/useVolumeFix';
import { LocalFeedback } from './components/LocalFeedback';
import { PlatformLinks } from './components/PlatformLinks';
import { formatAppRoute, parseAppRoute, usePageRoute } from './hooks/usePageRoute';
import { useWakeLock } from './hooks/useWakeLock';
import type { MixSelection } from './components/DailyMixPage';
import { SettingsPage, type SettingsSection } from './components/SettingsPage';
import { LocalMetadataReview } from './components/LocalMetadataReview';
import { useOnline } from './ui/network';
import { headingAtDock } from './ui/scrollHeading';
import {
  detailsEnabled,
  setDetailsEnabled,
  useCatalogueDetails,
} from './hooks/useCatalogueDetails';
import { ContextMenu, type ContextAction } from './components/ContextMenu';
import { MusicLighting } from './components/MusicLighting';
import { QueuePanel } from './components/QueuePanel';
import { useInteractionRipples } from './hooks/useInteractionRipples';
import { StartupAnimation } from './components/StartupAnimation';
import { WelcomeSetup } from './components/WelcomeSetup';
import { useMusicEnergy } from './hooks/useMusicEnergy';
import { SearchPage } from './components/SearchPage';
import { useListeningHistory } from './hooks/useListeningHistory';
import { LibraryMaintenance } from './components/LibraryMaintenance';
import { useAutomaticLyrics } from './hooks/useAutomaticLyrics';
import { StorageSettings } from './components/StorageSettings';
import { useCustomizations } from './hooks/useCustomizations';
import { ArtistEditor } from './components/ArtistEditor';
import { ReorderSongs } from './components/ReorderSongs';
import { orderedTracks } from './domain/order';
import type { ArtistProfile } from './domain/types';
import { LibrarySurface } from './components/LibrarySurface';
import { HomePage } from './components/HomePage';
import { HomeGreeting } from './components/HomeGreeting';
import { Artists, ArtistHeader } from './components/Artists';
import {
  albumKey,
  artistCredits,
  collectAlbums,
  collectArtists,
  primaryArtist,
} from './domain/collections';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { MotionPreference, useWaveMotion } from './ui/motion';
import { useI18n } from './i18n';
import { languages } from './i18n/dictionary';
import { usePlaylists } from './hooks/usePlaylists';
import { PlaylistCollection, PlaylistHeader } from './components/PlaylistCollection';
import { PlaylistDialog, AddSongsDialog, AddToPlaylistDialog } from './components/PlaylistDialog';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Music2,
  Disc3,
  Users,
  ArrowLeft,
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
} from './components/Glyphs';
import { useLibrary } from './hooks/useLibrary';
import { useAppPalette } from './hooks/useAppPalette';
import { usePlayer } from './hooks/usePlayer';

const DevicesPage = lazy(() =>
  import('./components/DevicesPage').then((module) => ({ default: module.DevicesPage })),
);
const RemixPage = lazy(() =>
  import('./components/RemixPage').then((module) => ({ default: module.RemixPage })),
);
const MigrationSheet = lazy(() =>
  import('./components/MigrationSheet').then((module) => ({ default: module.MigrationSheet })),
);
const LyricsEditor = lazy(() =>
  import('./components/LyricsEditor').then((module) => ({ default: module.LyricsEditor })),
);
const TrackEditor = lazy(() =>
  import('./components/TrackEditor').then((module) => ({ default: module.TrackEditor })),
);
const DailyMixPage = lazy(() =>
  import('./components/DailyMixPage').then((module) => ({ default: module.DailyMixPage })),
);
import { Artwork } from './components/Artwork';
import { LibraryContent } from './components/LibraryContent';
import { Navigation, type Page } from './components/Navigation';
import { Modal } from './components/Modal';
import { PlayerBar } from './components/PlayerBar';
import { getClip, loadClips, removeClip } from './domain/videoClips';
import { AddMusicDialog } from './components/AddMusicDialog';
import { AddMusicMenu } from './components/AddMusicMenu';
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
  const { t, choice: languageChoice, setChoice: setLanguageChoice } = useI18n();
  const [greetingSeed] = useState(Math.random);
  const [greetingNow, setGreetingNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setGreetingNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const library = useLibrary();
  const [automaticLyrics, setAutomaticLyrics] = useState(
    () => readFlag('wave-lyrics-consent-v1') && readFlag('wave-auto-lyrics'),
  );
  const [volumeFixEnabled, setVolumeFixEnabled] = useState(() => readFlag('wave-fix-volume'));
  useEffect(() => {
    try {
      localStorage.setItem('wave-fix-volume', String(volumeFixEnabled));
    } catch {}
  }, [volumeFixEnabled]);
  const [videoClip, setVideoClip] = useState(() => readFlag('wave-video-clip'));
  const [wordSources, setWordSources] = useState(extendedLyricsEnabled);
  useEffect(() => {
    try {
      localStorage.setItem('wave-video-clip', String(videoClip));
    } catch {}
  }, [videoClip]);
  useEffect(() => {
    try {
      localStorage.setItem('wave-auto-lyrics', String(automaticLyrics));
    } catch {}
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

  const silenceAction = library.silence;
  const silenceStore = useMemo(
    () => ({
      record: (id: string, bounds: { start: number; end: number }) =>
        void silenceAction(id, 'record', bounds),
      trim: (id: string, bounds: { start: number; end: number }) =>
        void silenceAction(id, 'trim', bounds),
      keep: (id: string) => void silenceAction(id, 'keep'),
    }),
    [silenceAction],
  );
  const player = usePlayer(library.tracks, !library.loading, silenceStore, volumeFixEnabled);
  const volumeStatus = useVolumeFix(
    library.tracks,
    volumeFixEnabled,
    library.loading || !!library.progress,
    library.applyVolumeFix,
    player.current?.id,
  );
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
    wordSources,
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

  useWakeLock(player.state.playing && !!player.current);

  const [pairLink] = useState(() => /(?:#|&|\?)wave-pair=/u.test(location.hash + location.search));
  const [initialRoute] = useState(() => parseAppRoute(location.pathname, location.search));
  const [page, setPage, pageDirection] = usePageRoute(pairLink);
  const [dailySelection, setDailySelection] = useState<MixSelection | null>(null);
  const [view, setView] = useState<LibraryView>(() => initialRoute.view ?? 'songs');
  const [query, setQuery] = useState(() => initialRoute.query ?? '');
  const [sort, setSort] = useState(() =>
    initialRoute.playlistId
      ? 'playlist'
      : initialRoute.view === 'albums' && initialRoute.group
        ? 'album'
        : 'recent',
  );
  const [group, setGroup] = useState<string | null>(() => initialRoute.group ?? null);
  const [queueOpen, setQueueOpen] = useState(() => initialRoute.overlay === 'queue');

  const listening = useListeningHistory({
    track: player.current,
    playing: player.state.playing && !player.buffering,
    duration: player.duration,
    readTime: player.readTime,
    tracks: library.tracks,
    repeatSerial: player.repeatSerial,
  });
  const greetingTrack = player.current;
  const greetingPlaying = player.state.playing;
  const greeting = useMemo(() => {
    const recent = listening.moodSignals.filter(
      (signal) =>
        signal.at !== undefined &&
        signal.at <= greetingNow &&
        greetingNow - signal.at <= 90 * 60_000,
    );
    const mood =
      greetingPlaying && recent.some((signal) => signal.seconds >= 25)
        ? inferListeningMood(
            library.tracks,
            [],
            greetingTrack,
            (track) => cachedAnalysis(track.blob),
            recent,
            greetingNow,
          )
        : undefined;
    return greetingFor(
      greetingGroup({
        now: greetingNow,
        signals: listening.moodSignals,
        mood,
        playing: greetingPlaying,
      }),
      greetingSeed,
    );
  }, [
    greetingNow,
    greetingSeed,
    library.tracks,
    listening.moodSignals,
    greetingTrack,
    greetingPlaying,
  ]);
  const setPlayerMoodSignals = player.setMoodSignals;
  useEffect(() => {
    setPlayerMoodSignals(listening.moodSignals);
  }, [setPlayerMoodSignals, listening.moodSignals]);
  const [playerOpen, setPlayerOpen] = useState(() => initialRoute.overlay === 'current');
  const playerOpener = useRef<HTMLElement | null>(null);
  const settingsPrevious = useRef<Page>('home');
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(
    () => initialRoute.settingsSection ?? null,
  );
  const settingsOpener = useRef<HTMLElement | null>(null);
  const openSettings = (section?: SettingsSection | null) => {
    const nextSection = typeof section === 'string' ? section : null;
    if (page !== 'settings') settingsPrevious.current = page;
    settingsOpener.current = document.activeElement as HTMLElement;
    setSettingsSection(nextSection);
    setPage('settings');
  };
  const closeSettings = () => {
    setPage(settingsPrevious.current);

    setSettingsSection(null);
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

  const [detailsOn, setDetailsOn] = useState(() => detailsEnabled());
  const [libraryClips, setLibraryClips] = useState(() => readFlag('wave-library-clips-consent-v1'));
  const [contrastCatalogues, setContrastCatalogues] = useState(() =>
    readFlag('wave-catalogue-contrast-consent-v1'),
  );
  useEffect(() => {
    try {
      localStorage.setItem('wave-catalogue-contrast-consent-v1', String(contrastCatalogues));
    } catch {}
  }, [contrastCatalogues]);
  const [verifyLibraryRoles, setVerifyLibraryRoles] = useState(() =>
    readFlag('wave-library-role-check-consent-v1'),
  );
  useEffect(() => {
    try {
      localStorage.setItem('wave-library-role-check-consent-v1', String(verifyLibraryRoles));
    } catch {}
  }, [verifyLibraryRoles]);
  useEffect(() => {
    try {
      localStorage.setItem('wave-library-clips-consent-v1', String(libraryClips));
    } catch {}
  }, [libraryClips]);
  const toggleDetails = useCallback((next: boolean) => {
    setDetailsEnabled(next);
    setDetailsOn(next);
  }, []);
  const online = useOnline();
  useLibraryClips(library.tracks, detailsOn && libraryClips, online);
  const artistPhotoSearch = useArtistPhotos(
    library.tracks,
    customizations.artists,
    customizations.fillArtistPhoto,
  );
  const {
    find: findArtistPhotos,
    cancel: cancelArtistPhotos,
    searching: searchingArtistPhotos,
  } = artistPhotoSearch;
  useEffect(() => {
    if (!detailsOn || !online) {
      cancelArtistPhotos();
      return;
    }
    if (searchingArtistPhotos) return;
    const timer = window.setTimeout(() => void findArtistPhotos(true), 1200);
    return () => window.clearTimeout(timer);
  }, [detailsOn, online, cancelArtistPhotos, findArtistPhotos, searchingArtistPhotos]);
  const catalogue = useCatalogueDetails({
    tracks: library.tracks,
    onUpdate: library.applyDetails,
    enabled: detailsOn,
    online,
    verifyRoles: verifyLibraryRoles,
    contrastCatalogues,
  });
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(
    () => initialRoute.playlistId ?? null,
  );

  const routeSyncReady = useRef(false);
  useEffect(() => {
    if (pairLink && page === 'settings') return;
    const overlay = playerOpen ? 'current' : queueOpen ? 'queue' : undefined;
    const nextUrl = formatAppRoute({
      page,
      overlay,
      view,
      group,
      playlistId,
      settingsSection,
      query,
    });
    const currentUrl = location.pathname + location.search;
    if (!routeSyncReady.current) {
      routeSyncReady.current = true;
      if (currentUrl !== nextUrl) {
        history.replaceState(null, '', nextUrl + location.hash);
      }
      return;
    }
    if (currentUrl !== nextUrl) {
      const isOverlayToggle =
        nextUrl.endsWith('/Current') ||
        nextUrl.endsWith('/Queue') ||
        location.pathname.endsWith('/Current') ||
        location.pathname.endsWith('/Queue');
      if (isOverlayToggle) {
        history.pushState(null, '', nextUrl + location.hash);
      } else {
        history.replaceState(null, '', nextUrl + location.hash);
      }
    }
  }, [page, view, group, playlistId, settingsSection, query, playerOpen, queueOpen, pairLink]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseAppRoute(location.pathname, location.search);
      setPlayerOpen(parsed.overlay === 'current');
      setQueueOpen(parsed.overlay === 'queue');
      if (parsed.page === 'library') {
        setView(parsed.view ?? 'songs');
        setGroup(parsed.group ?? null);
        setPlaylistId(parsed.playlistId ?? null);
      } else if (parsed.page === 'settings') {
        setSettingsSection(parsed.settingsSection ?? null);
      } else if (parsed.page === 'search') {
        setQuery(parsed.query ?? '');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [playlistForm, setPlaylistForm] = useState<'new' | 'edit' | null>(null);
  const [addingSongs, setAddingSongs] = useState(false);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [pendingPlaylistTrack, setPendingPlaylistTrack] = useState<Track | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const selectedPlaylist = collections.playlists.find((playlist) => playlist.id === playlistId);
  const [largeText, setLargeText] = useState(() => readFlag('wave-large-text'));
  useEffect(() => {
    document.documentElement.dataset.textSize = largeText ? 'large' : 'standard';
    try {
      localStorage.setItem('wave-large-text', String(largeText));
    } catch {}
  }, [largeText]);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [listenerName, setListenerName] = useState(() => {
    try {
      return (localStorage.getItem('wave-listener-name') ?? '').slice(0, 40);
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('wave-listener-name', listenerName.trim());
    } catch {}
  }, [listenerName]);
  const [startupDone, setStartupDone] = useState(false);
  const [setupActive, setSetupActive] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);
  useEffect(() => {
    if (!startupDone || library.loading || setupChecked) return;
    const timer = window.setTimeout(() => {
      setSetupChecked(true);
      if (!library.error && !library.tracks.length && !readFlag('wave-welcome-done'))
        setSetupActive(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startupDone, library.loading, library.error, library.tracks.length, setupChecked]);
  const finishSetup = () => {
    try {
      localStorage.setItem('wave-welcome-done', 'true');
    } catch {}
    setSetupActive(false);
  };

  const [dragging, setDragging] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const categoryStrip = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const dragDepth = useRef(0);
  const [bannerCovered, setBannerCovered] = useState(false);
  const [scrolledHeading, setScrolledHeading] = useState('');

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const bannerHeight = Math.max(88, headerRef.current?.offsetHeight ?? 124);
      const surface = workspace.querySelector<HTMLElement>(':scope > .library-surface');
      const surfaceTop = surface?.getBoundingClientRect().top;
      const visibleBannerPx =
        surfaceTop !== undefined
          ? Math.max(0, surfaceTop)
          : Math.max(0, bannerHeight - window.scrollY);
      const progress = Math.max(0, Math.min(1, 1 - visibleBannerPx / bannerHeight));

      const covered = visibleBannerPx <= 0;
      workspace.style.setProperty('--banner-cover', progress.toFixed(3));
      workspace.dataset.bannerCovered = covered ? 'true' : 'false';
      setBannerCovered((prev) => (prev === covered ? prev : covered));

      const headings = Array.from(
        workspace.querySelectorAll<HTMLElement>(
          '.library-surface section > .section-heading h2, .library-surface .remix-head h2, .library-surface .remix-section h3, .library-surface .settings-page > h2',
        ),
      ).filter((el) => el.offsetParent !== null && Boolean(el.textContent?.trim()));

      const dock = workspace.querySelector<HTMLElement>('.section-scroll-dock__bar');
      const threshold = (dock?.offsetHeight ?? 64) - 6;
      const activeText = headingAtDock(
        headings
          .filter((heading) => !heading.closest('[inert], [aria-hidden="true"]'))
          .map((heading) => ({
            top: heading.getBoundingClientRect().top,
            text: heading.textContent ?? '',
          })),
        threshold,
      );
      setScrolledHeading((prev) => (prev === activeText ? prev : activeText));
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(onScroll);
    observer.observe(workspace, { childList: true, subtree: true });
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [
    page,
    view,
    group,
    playlistId,
    dailySelection,
    settingsSection,
    setupActive,
    setupChecked,
    startupDone,
    library.loading,
  ]);

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
    } catch {}
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
  }, [dispatch, setPage]);

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
    } catch {}
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
        view === 'artists'
          ? artistCredits(track.artist).includes(group)
          : albumKey(track) === group,
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

  const settingsSectionLabels: Record<SettingsSection, string> = {
    appearance: t('Appearance'),
    playback: t('Playback'),
    lyrics: t('Lyrics'),
    library: t('Library'),
    devices: t('Devices'),
    storage: t('Storage'),
    about: t('About'),
  };
  const libraryViewLabels: Record<LibraryView, string> = {
    songs: t('Songs'),
    albums: t('Albums'),
    artists: t('Artists'),
    playlists: t('Playlists'),
    favorites: t('Favorites'),
  };
  const activeAlbum = group && view === 'albums' ? albums.find((a) => a.id === group) : undefined;
  const dockSectionTitle =
    page === 'home'
      ? dailySelection
        ? `Daily mix ${dailySelection.number} · ${dailySelection.mix.label}`
        : t('Home')
      : page === 'search'
        ? t('Search')
        : page === 'remix'
          ? t('Remix')
          : page === 'settings'
            ? settingsSection
              ? settingsSectionLabels[settingsSection]
              : t('Settings')
            : selectedPlaylist
              ? selectedPlaylist.name
              : activeAlbum
                ? activeAlbum.name
                : selectedArtist
                  ? selectedArtist.name
                  : libraryViewLabels[view];

  const pageSummary =
    page === 'search'
      ? t('Songs, albums and artists on this device')
      : page === 'settings'
        ? t('Playback, appearance, lyrics and storage')
        : page === 'remix'
          ? t('The songs you played this week')
          : page === 'library' && view !== 'songs'
            ? t(
                library.tracks.length === 1
                  ? '{count} song in your library'
                  : '{count} songs in your library',
                { count: library.tracks.length },
              )
            : `${t(library.tracks.length === 1 ? '{count} song' : '{count} songs', { count: library.tracks.length })} · ${t(albums.length === 1 ? '{count} album' : '{count} albums', { count: albums.length })}`;
  const busy = library.loading || !!library.progress;
  const chooseFiles = useCallback(() => input.current?.click(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [addInitialMode, setAddInitialMode] = useState<'choose' | 'youtube'>('choose');

  const openAddMusic = useCallback(() => {
    setAddInitialMode('choose');
    setAddOpen(true);
  }, []);
  const [addBusy, setAddBusy] = useState(false);

  const addFromYouTube = useCallback(
    async (
      link: string,
      prefilled?: { title?: string; artist?: string; duration?: number; thumbnail?: string },
    ) => {
      setAddBusy(true);
      try {
        return await library.addYouTube(link, prefilled);
      } finally {
        setAddBusy(false);
      }
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
  const openPlaylist = useCallback(
    (id: string) => {
      setPage('library');
      setView('playlists');
      setPlaylistId(id);
      setGroup(null);
      setQuery('');
      setSort('playlist');
    },
    [setPage],
  );
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
    [changeView, setPage],
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
      setGroup(primaryArtist(name));
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
  const saveMigrated = useCallback(
    async (name: string, trackIds: string[]) => {
      const saved = await collections.create(
        {
          name,
          description: t('Brought over from another app with YouTube songs.'),
        },
        trackIds,
      );
      if (!saved) return false;
      setView('playlists');
      setPlaylistId(saved.id);
      return true;
    },
    [collections, t],
  );
  const playShuffle = () => shuffleCollection(visible);

  const contextTrack = context?.trackId
    ? library.tracks.find((track) => track.id === context.trackId)
    : undefined;
  const contextActions: ContextAction[] = contextTrack
    ? [
        {
          label: t('Play song'),
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
          label: player.state.queue.includes(contextTrack.id)
            ? t('Already in queue')
            : t('Add to queue'),
          icon: <Plus size={18} />,
          disabled: player.state.queue.includes(contextTrack.id),
          run: () => player.enqueue([contextTrack.id]),
        },
        {
          label: contextTrack.favorite ? t('Remove from favorites') : t('Add to favorites'),
          icon: <Heart size={18} />,
          run: () => void library.toggleFavorite(contextTrack),
        },
        {
          label: t('Add to playlist'),
          icon: <ListMusic size={18} />,
          run: () => setAddingTrack(contextTrack),
        },
        {
          label: t('Edit lyrics'),
          icon: <Pencil size={18} />,
          run: () => setEditingLyrics(contextTrack),
        },
        {
          label: t('Song options'),
          icon: <SlidersHorizontal size={18} />,
          run: () => setTrackOptions(contextTrack),
        },
      ]
    : [
        {
          label: player.state.playing ? t('Pause') : t('Play'),
          icon: player.state.playing ? <Pause size={18} /> : <Play size={18} />,
          disabled: !player.current,
          run: () => dispatch({ type: 'toggle' }),
        },
        {
          label: t('Next song'),
          icon: <SkipForward size={18} />,
          disabled: !player.current,
          run: () => dispatch({ type: 'next' }),
        },
        {
          label: t('Playback queue'),
          icon: <ListMusic size={18} />,
          run: () => setQueueOpen(true),
        },
        { label: t('Import music'), icon: <Plus size={18} />, disabled: busy, run: chooseFiles },
        { label: t('Settings'), icon: <Settings size={18} />, run: () => openSettings() },
      ];

  const setupRequired =
    setupActive ||
    (!library.loading &&
      !library.error &&
      !library.tracks.length &&
      !setupChecked &&
      !readFlag('wave-welcome-done'));
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
      {!setupRequired && (
        <LocalFeedback
          page={
            playerOpen
              ? 'Now playing'
              : page === 'home'
                ? 'Home'
                : page === 'search'
                  ? 'Search'
                  : page === 'library'
                    ? 'Library'
                    : page === 'remix'
                      ? 'Remix'
                      : 'Settings'
          }
        />
      )}
      {!setupRequired && (
        <a className="skip-link" href="#main">
          {t('Skip to library')}
        </a>
      )}
      <input
        ref={input}
        className="file-input"
        aria-label={t('Import audio files')}
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
      <StartupAnimation loading={library.loading} onFinished={() => setStartupDone(true)} />
      {!setupRequired && (
        <>
          <MusicLighting className="music-backdrop" />
          <Navigation
            page={page}
            onPage={changePage}
            onSettings={() => openSettings()}
            view={view}
            onView={browse}
            counts={{
              albums: albums.length,
              artists: artists.length,
              playlists: collections.playlists.length,
              favorites: favoriteCount,
            }}
          />
          <main ref={workspaceRef} id="main" tabIndex={-1} className={`workspace ${page}-page`}>
            <header ref={headerRef} className="library-header">
              {}
              <div className="title-row">
                <div>
                  <h1>
                    {page === 'home' ? (
                      dailySelection ? (
                        t('Daily mixes')
                      ) : listenerName.trim() ? (
                        <HomeGreeting
                          key={listenerName.trim()}
                          active={startupDone && !library.loading}
                          home={t('Home')}
                          greeting={t(greeting, { name: listenerName.trim() })}
                        />
                      ) : (
                        t('Home')
                      )
                    ) : page === 'search' ? (
                      t('Search')
                    ) : page === 'settings' ? (
                      t('Settings')
                    ) : page === 'remix' ? (
                      t('Remix')
                    ) : (
                      t('Library')
                    )}
                  </h1>
                  <p className="library-summary">{pageSummary}</p>
                </div>
                <div
                  className="header-actions"
                  aria-hidden={bannerCovered || undefined}
                  inert={bannerCovered || undefined}
                >
                  <AddMusicMenu
                    busy={busy || addBusy}
                    onLocal={chooseFiles}
                    onFolderFiles={importFiles}
                    onYouTube={addFromYouTube}
                    onAdded={playAdded}
                    onYouTubeChoice={() => {
                      setAddInitialMode('youtube');
                      setAddOpen(true);
                    }}
                  />
                  <button
                    className="icon-button settings-button"
                    aria-label={t('Open settings')}
                    onClick={() => openSettings()}
                  >
                    <Settings size={24} />
                  </button>
                </div>
              </div>
              {page === 'library' && (
                <div ref={categoryStrip} className="library-tabs" aria-label={t('Browse library')}>
                  {(
                    [
                      {
                        id: 'songs',
                        label: t('Songs'),
                        icon: Music2,
                        count: library.tracks.length,
                      },
                      { id: 'albums', label: t('Albums'), icon: Disc3, count: albums.length },
                      { id: 'artists', label: t('Artists'), icon: Users, count: artists.length },
                      {
                        id: 'playlists',
                        label: t('Playlists'),
                        icon: ListMusic,
                        count: collections.playlists.length,
                      },
                      { id: 'favorites', label: t('Favorites'), icon: Heart, count: favoriteCount },
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
            <div className="section-scroll-dock">
              <div className="section-scroll-dock__bar">
                {bannerCovered &&
                  (page === 'settings' ||
                    (page === 'home' && dailySelection) ||
                    (page === 'library' && (group || selectedPlaylist))) && (
                    <button
                      type="button"
                      className="icon-button section-scroll-dock__back"
                      aria-label={t('Back')}
                      onClick={() => {
                        if (page === 'settings')
                          workspaceRef.current
                            ?.querySelector<HTMLButtonElement>('.settings-back')
                            ?.click();
                        else if (page === 'home') setDailySelection(null);
                        else {
                          setGroup(null);
                          setPlaylistId(null);
                          setQuery('');
                          if (view === 'albums') setSort('recent');
                        }
                      }}
                    >
                      <ArrowLeft size={20} aria-hidden="true" />
                    </button>
                  )}
                <button
                  type="button"
                  className="section-scroll-dock__heading"
                  tabIndex={bannerCovered ? 0 : -1}
                  aria-hidden={!bannerCovered || undefined}
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <span
                    key={scrolledHeading || dockSectionTitle}
                    className="section-scroll-dock__title"
                  >
                    {scrolledHeading || dockSectionTitle}
                  </span>
                </button>
                {bannerCovered && (
                  <div className="section-scroll-dock__actions">
                    <AddMusicMenu
                      busy={busy || addBusy}
                      onLocal={chooseFiles}
                      onFolderFiles={importFiles}
                      onYouTube={addFromYouTube}
                      onAdded={playAdded}
                      onYouTubeChoice={() => {
                        setAddInitialMode('youtube');
                        setAddOpen(true);
                      }}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('Open settings')}
                      onClick={() => openSettings()}
                    >
                      <Settings size={20} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
              <LibrarySurface
                home={page === 'home'}
                key={`${page}:${dailySelection?.mix.id ?? ''}:${view}:${group ?? ''}:${playlistId ?? ''}`}
              >
                {page === 'settings' ? (
                  <Suspense fallback={<SurfaceLoading />}>
                    <SettingsPage
                      initialSection={settingsSection ?? (pairLink ? 'devices' : null)}
                      onSectionChange={setSettingsSection}
                      onBack={closeSettings}
                      appearance={
                        <>
                          <label className="settings-label" htmlFor="listener-name">
                            {t('Your name')}
                          </label>
                          <input
                            id="listener-name"
                            className="listener-name-input"
                            value={listenerName}
                            maxLength={40}
                            autoComplete="off"
                            onChange={(event) => setListenerName(event.target.value)}
                          />
                          <p className="settings-row-note">
                            {t(
                              'Optional. Your name stays on this device and you can change it later.',
                            )}
                          </p>
                          <div className="settings-label">{t('Theme')}</div>
                          <div className="theme-options">
                            {(['dark', 'light', 'system'] as const).map((option) => (
                              <button
                                key={option}
                                className={theme === option ? 'chosen' : ''}
                                aria-pressed={theme === option}
                                onClick={() => setTheme(option)}
                              >
                                {t(option[0].toUpperCase() + option.slice(1))}
                                {theme === option && <Check size={18} />}
                              </button>
                            ))}
                          </div>
                          {}
                          <div className="settings-label">{t('Language')}</div>
                          <div className="theme-options">
                            {languages.map((option) => (
                              <button
                                key={option.id}
                                className={languageChoice === option.id ? 'chosen' : ''}
                                aria-pressed={languageChoice === option.id}
                                onClick={() => setLanguageChoice(option.id)}
                              >
                                {option.id === 'system' ? t('System') : option.label}
                                {languageChoice === option.id && <Check size={18} />}
                              </button>
                            ))}
                          </div>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Larger text')}</strong>
                            </div>
                            <MaterialSwitch
                              label={t('Larger text')}
                              checked={largeText}
                              onChange={setLargeText}
                            />
                          </div>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Animations')}</strong>
                            </div>
                            <MaterialSwitch
                              label={t('Animations')}
                              checked={animations}
                              onChange={onAnimations}
                            />
                          </div>
                        </>
                      }
                      playback={
                        <>
                          <VolumeSettings
                            enabled={volumeFixEnabled}
                            status={volumeStatus}
                            onChange={(enabled) => {
                              if (enabled)
                                void player
                                  .prepareVolumeFix()
                                  .then(() => setVolumeFixEnabled(true))
                                  .catch((error: unknown) =>
                                    library.setError(
                                      error instanceof Error
                                        ? error.message
                                        : t('Volume could not be adjusted.'),
                                    ),
                                  );
                              else setVolumeFixEnabled(false);
                            }}
                          />
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Mix')}</strong>
                              <p>
                                {t(
                                  'Mix blends local songs together. YouTube songs play normally without Mix.',
                                )}
                              </p>
                            </div>
                            <MaterialSwitch
                              label={t('Mix')}
                              checked={player.mixEnabled}
                              onChange={(next) => {
                                player.setMixEnabled(next);
                                window.dispatchEvent(
                                  new CustomEvent('wave:feature-used', { detail: 'Mix' }),
                                );
                              }}
                            />
                          </div>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Video clip')}</strong>
                            </div>
                            <MaterialSwitch
                              label={t('Video clip')}
                              checked={videoClip}
                              onChange={setVideoClip}
                            />
                          </div>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Autoplay')}</strong>
                            </div>
                            <MaterialSwitch
                              label={t('Autoplay')}
                              checked={player.autoplay}
                              onChange={player.setAutoplay}
                            />
                          </div>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Resume playback on reload')}</strong>
                              <p className="settings-note">
                                {t('Continue playing where you left off when reopening Wave.')}
                              </p>
                            </div>
                            <MaterialSwitch
                              label={t('Resume playback on reload')}
                              checked={player.resumeOnReload}
                              onChange={player.setResumeOnReload}
                            />
                          </div>
                        </>
                      }
                      lyrics={
                        <>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Try more lyrics sources')}</strong>
                              <p className="settings-warning">
                                {t('Unofficial sources. Only the title and artist are sent.')}
                              </p>
                            </div>
                            <MaterialSwitch
                              label={t('Try more lyrics sources')}
                              checked={wordSources}
                              onChange={(next) => {
                                setWordSources(next);
                                setExtendedLyrics(next);
                              }}
                            />
                          </div>
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Automatic lyrics')}</strong>
                            </div>
                            <MaterialSwitch
                              label={t('Automatic lyrics')}
                              checked={automaticLyrics}
                              onChange={(next) => {
                                setAutomaticLyrics(next);
                                try {
                                  localStorage.setItem('wave-lyrics-consent-v1', 'true');
                                } catch {}
                              }}
                            />
                          </div>
                        </>
                      }
                      library={
                        <>
                          {' '}
                          <div className="settings-switch-row">
                            <div>
                              <strong>{t('Library editing')}</strong>
                            </div>
                            <MaterialSwitch
                              label={t('Library editing')}
                              checked={editorEnabled}
                              onChange={setEditorEnabled}
                            />
                          </div>
                          <LocalMetadataReview
                            advanced={
                              <>
                                <div className="settings-switch-row">
                                  <div>
                                    <strong>{t('Compare more catalogues')}</strong>
                                    <p className="settings-note">
                                      {t(
                                        'With Auto Fill on, compare new searches with Deezer and MusicBrainz. Song titles and artists are sent to those services. Existing manual edits are kept.',
                                      )}
                                    </p>
                                  </div>
                                  <MaterialSwitch
                                    label={t('Compare more catalogues')}
                                    checked={contrastCatalogues}
                                    onChange={setContrastCatalogues}
                                  />
                                </div>
                                <div className="settings-switch-row">
                                  <div>
                                    <strong>
                                      {t('Verify artist and title across the library')}
                                    </strong>
                                    <p className="settings-note">
                                      {t(
                                        'With Auto Fill on, check even complete songs against Apple and Deezer to detect swapped artist and title. Song names are sent to those providers. Manual edits and prior decisions are kept.',
                                      )}
                                    </p>
                                  </div>
                                  <MaterialSwitch
                                    label={t('Verify artist and title across the library')}
                                    checked={verifyLibraryRoles}
                                    onChange={setVerifyLibraryRoles}
                                  />
                                </div>
                                <div className="settings-switch-row">
                                  <div>
                                    <strong>{t('Find clips across the library')}</strong>
                                    <p className="settings-note">
                                      {t(
                                        'With Auto Fill on, send song titles and artists to public Piped and Invidious servers to find missing videos. Existing clips are kept. Turn this off to stop new requests.',
                                      )}
                                    </p>
                                  </div>
                                  <MaterialSwitch
                                    label={t('Find clips across the library')}
                                    checked={libraryClips}
                                    onChange={setLibraryClips}
                                  />
                                </div>
                                <p className="settings-note">
                                  {t(
                                    'Automatic lyrics can be enabled separately in Lyrics settings.',
                                  )}
                                </p>
                              </>
                            }
                            tracks={library.tracks}
                            onResolveRoles={library.resolveRoles}
                            enabled={detailsOn}
                            onToggle={toggleDetails}
                            onLookUp={() => void catalogue.lookUp()}
                            filling={catalogue.filling}
                            completed={catalogue.completed}
                            onFindArtistPhotos={() => void artistPhotoSearch.find()}
                            artistPhotoProgress={artistPhotoSearch.progress}
                          />
                        </>
                      }
                      devices={
                        <DevicesPage
                          tracks={library.tracks}
                          onAddLoaned={async (blob, name) => {
                            setNoticeVisible(true);
                            const result = await library.importFiles([
                              new File([blob], name, { type: blob.type }),
                            ]);
                            if (!result || (!result.added && !result.duplicates)) {
                              throw new Error('The song could not be added.');
                            }
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
                          <StorageSettings tracks={library.tracks} importing={busy || addBusy} />
                        </>
                      }
                      about={
                        <>
                          <PlatformLinks onDevices={() => openSettings('devices')} />
                          <a
                            className="settings-source"
                            href="https://github.com/jaime-gaming/Wave"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Wave {__WAVE_VERSION__} · {t('Source code')}
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
                  <Suspense fallback={<SurfaceLoading />}>
                    <RemixPage
                      summary={listening.summary}
                      recap={listening.recap}
                      listenerName={listenerName.trim()}
                      artists={artists}
                      artistPhotos={artistPhotos}
                      history={listening.history}
                      monthlyHistory={listening.monthlyHistory}
                      yearlyHistory={listening.yearlyHistory}
                      loaded={listening.loaded}
                      currentId={player.current?.id}
                      playing={player.state.playing}
                      onPlay={player.play}
                      onArtist={openArtist}
                      onAdd={openAddMusic}
                      onManageHistory={() => openSettings('storage')}
                      onSave={async (songs, periodRecap) => {
                        const label =
                          periodRecap.label ??
                          new Date(periodRecap.end).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          });
                        const saved = await collections.create(
                          {
                            name: `Remix · ${label}`.slice(0, 100),
                            description: t('Saved from Remix for {date}.', {
                              date: label,
                            }),
                          },
                          songs.map((track) => track.id),
                        );
                        if (!saved) return false;
                        openPlaylist(saved.id);
                        return true;
                      }}
                      onClear={listening.forget}
                    />
                  </Suspense>
                ) : page === 'home' && dailySelection ? (
                  <Suspense fallback={<SurfaceLoading />}>
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
                            name: dailyMixPlaylistName(
                              new Date(),
                              collections.playlists.map((playlist) => playlist.name),
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
                    listening={listening.summary}
                    moodSignals={listening.moodSignals}
                    playlists={collections.playlists}
                    current={player.current}
                    playing={player.state.playing}
                    loading={library.loading}
                    busy={busy}
                    onAdd={openAddMusic}
                    addAction={
                      <AddMusicMenu
                        label
                        busy={busy || addBusy}
                        onLocal={chooseFiles}
                        onFolderFiles={importFiles}
                        onYouTube={addFromYouTube}
                        onAdded={playAdded}
                        onYouTubeChoice={() => {
                          setAddInitialMode('youtube');
                          setAddOpen(true);
                        }}
                      />
                    }
                    onView={browse}
                    onAlbum={openAlbum}
                    onArtist={openArtist}
                    onPlaylist={openPlaylist}
                    onPlay={player.play}
                    onFavorite={favoriteTrack}
                    onMore={setTrackOptions}
                    artistPhotos={artistPhotos}
                    onDevices={() => openSettings('devices')}
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
                      <h2>{t('Loading playlists')}</h2>
                    </div>
                  ) : (
                    <PlaylistCollection
                      playlists={collections.playlists}
                      tracks={library.tracks}
                      query={query}
                      onOpen={openPlaylist}
                      onCreate={() => setPlaylistForm('new')}
                      onImport={() => setMigrationOpen(true)}
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
                        <h2>{view === 'favorites' ? t('Favorite songs') : t('All songs')}</h2>
                      </div>
                    )}
                    <div className="library-toolbar">
                      <div className="library-play-actions">
                        <button
                          className="tonal-button shuffle-all"
                          aria-label={t('Shuffle all songs')}
                          disabled={!visible.length}
                          onClick={playShuffle}
                        >
                          <Shuffle size={20} />
                          {t('Shuffle')}
                        </button>
                        <button
                          className="icon-button play-all"
                          aria-label={t('Play all songs')}
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
                                  customizations.albums.find((order) => order.id === group)
                                    ?.trackIds,
                                );
                            setReordering({
                              kind: selectedPlaylist ? 'playlist' : 'album',
                              id: selectedPlaylist?.id ?? group!,
                              name: selectedPlaylist?.name ?? album?.name ?? t('Album'),
                              tracks,
                            });
                          }}
                        >
                          {t('Reorder songs')}
                        </button>
                      )}
                      <label className="sort-control">
                        <SlidersHorizontal size={20} />
                        <select
                          aria-label={t('Sort tracks')}
                          value={sort}
                          onChange={(event) => setSort(event.target.value)}
                        >
                          {selectedPlaylist && (
                            <option value="playlist">{t('Playlist order')}</option>
                          )}
                          {view === 'albums' && group && (
                            <option value="album">{t('Album order')}</option>
                          )}
                          <option value="recent">{t('Recently added')}</option>
                          <option value="title">{t('Title A–Z')}</option>
                          <option value="artist">{t('Artist A–Z')}</option>
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
            videoClip={videoClip}
            onToggleVideoClip={() => setVideoClip(!videoClip)}
          />
        </>
      )}
      {setupActive && (
        <WelcomeSetup
          animations={animations}
          onAnimations={onAnimations}
          largeText={largeText}
          onLargeText={setLargeText}
          theme={theme}
          onTheme={setTheme}
          name={listenerName}
          onName={setListenerName}
          mixEnabled={player.mixEnabled}
          onMixEnabled={player.setMixEnabled}
          volumeFix={volumeFixEnabled}
          onVolumeFix={(enabled) => {
            if (enabled)
              void player
                .prepareVolumeFix()
                .then(() => setVolumeFixEnabled(true))
                .catch(() => library.setError(t('Volume could not be adjusted.')));
            else setVolumeFixEnabled(false);
          }}
          automaticLyrics={automaticLyrics}
          onAutomaticLyrics={(next) => {
            setAutomaticLyrics(next);
            try {
              localStorage.setItem('wave-lyrics-consent-v1', 'true');
            } catch {}
          }}
          wordSources={wordSources}
          onWordSources={(next) => {
            setWordSources(next);
            setExtendedLyrics(next);
          }}
          progress={library.progress}
          message={library.message}
          tracks={library.tracks}
          error={library.error}
          onAdd={openAddMusic}
          onFinish={finishSetup}
        />
      )}
      <AnimatePresence>
        {addOpen && (
          <AddMusicDialog
            setup={setupActive}
            initialMode={addInitialMode}
            key="add-music"
            onClose={() => setAddOpen(false)}
            onLocal={chooseFiles}
            onFolderFiles={importFiles}
            onYouTube={addFromYouTube}
            onAdded={setupActive ? () => {} : playAdded}
            busy={busy || addBusy}
          />
        )}
        {migrationOpen && (
          <Suspense key="migration" fallback={null}>
            <MigrationSheet
              tracks={library.tracks}
              onAddVideo={library.addPlaylistVideo}
              onSave={saveMigrated}
              onClose={() => setMigrationOpen(false)}
            />
          </Suspense>
        )}
        {queueOpen && (
          <Modal
            key="queue"
            title={t('Queue')}
            className="queue-sheet"
            placement="side"
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
            title={t('Song options')}
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
              {trackOptions.favorite ? t('Remove from favorites') : t('Add to favorites')}
            </button>
            <button
              className="options-action"
              onClick={() => {
                setAddingTrack(trackOptions);
                setTrackOptions(null);
              }}
            >
              <ListMusic size={22} />
              {t('Add to playlist')}
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
              {player.state.queue.includes(trackOptions.id)
                ? t('Already in queue')
                : t('Add to queue')}
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
              {t('Edit lyrics')}
            </button>
            {trackOptions.videoId && (
              <a
                className="options-action"
                href={`https://www.youtube.com/watch?v=${trackOptions.videoId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ArrowUpRight size={22} />
                {t('Open on YouTube')}
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
                {t('Remove video clip')}
              </button>
            )}
            {volumeFixEnabled && trackOptions.blob && (
              <button
                className="options-action"
                disabled={!volumeStatus.supported}
                onClick={() => {
                  volumeStatus.requestTrack(trackOptions.id);
                  setTrackOptions(null);
                }}
              >
                <SlidersHorizontal size={22} />
                {trackOptions.volumeFix ? t('Reanalyze this song') : t('Balance this song')}
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
                {t('Edit song')}
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
                  {t('Move up in playlist')}
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
                  {t('Move down in playlist')}
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
                  {t('Remove from playlist')}
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
              {t('Remove from library')}
            </button>
          </Modal>
        )}
        {removeTarget && (
          <Modal
            key="remove-track"
            title={t('Remove this track?')}
            onClose={() => {
              if (!removing) setRemoveTarget(null);
            }}
          >
            <p className="modal-description">
              {t(
                'Remove “{title}” from your library and queue? The original file on your device won’t be changed.',
                { title: removeTarget.title },
              )}
            </p>
            <div className="modal-actions">
              <button
                className="tonal-button"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
              >
                {t('Keep track')}
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
                {t('Remove track')}
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
          <Suspense key={`lyrics-${editingLyrics.id}`} fallback={null}>
            <LyricsEditor
              track={editingLyrics}
              retryAt={library.tracks.reduce(
                (max, t) => Math.max(max, t.lyricsLookup?.retryAt ?? 0),
                0,
              )}
              onSave={library.saveLyrics}
              onClose={() => setEditingLyrics(null)}
            />
          </Suspense>
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
          <Suspense key={`edit-${editingTrack.id}`} fallback={null}>
            <TrackEditor
              track={editingTrack}
              onClose={() => setEditingTrack(null)}
              onSave={library.editMetadata}
              onRestore={library.restoreMetadata}
              onRestoreSilence={(id) => library.silence(id, 'restore')}
              onTrim={(bounds) => library.silence(editingTrack.id, 'trim', bounds)}
              onPreview={player.pauseForPreview}
              previewVolume={player.volume}
              onBalance={
                volumeFixEnabled && editingTrack.blob
                  ? () => volumeStatus.requestTrack(editingTrack.id)
                  : undefined
              }
              balanceSupported={volumeStatus.supported}
            />
          </Suspense>
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
            title={t('Delete playlist?')}
            onClose={() => {
              if (!removing) setDeletingPlaylist(false);
            }}
          >
            <p className="modal-description">
              {t('Delete “{name}”? Your songs will stay in the library.', {
                name: selectedPlaylist.name,
              })}
            </p>
            <div className="modal-actions">
              <button
                className="tonal-button"
                disabled={removing}
                onClick={() => setDeletingPlaylist(false)}
              >
                {t('Keep playlist')}
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
                {t('Delete playlist')}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
      {!setupRequired && (error || (library.message && noticeVisible) || library.progress) && (
        <div
          className={`toast ${library.progress ? 'library-update-toast' : ''} ${error ? 'error-toast' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          <span>
            {error ||
              (library.progress
                ? t('Importing {done} of {total} files…', {
                    done: library.progress.done,
                    total: library.progress.total,
                  })
                : library.message)}
          </span>
          {library.progress && (
            <div className="library-update-status">
              <div
                className="library-update-track"
                role="progressbar"
                aria-label="Updating your library"
                aria-valuemin={0}
                aria-valuemax={library.progress.total}
                aria-valuenow={library.progress.done}
              >
                <motion.span
                  animate={{
                    scaleX: library.progress.total
                      ? library.progress.done / library.progress.total
                      : 0,
                  }}
                  transition={animation.fast}
                />
              </div>
            </div>
          )}
          {!library.progress && (
            <button
              className="icon-button"
              aria-label={t('Dismiss notification')}
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
          <h2>{busy ? t('Import in progress') : t('Add music')}</h2>
          <p>{busy ? t('Wait for this import to finish.') : t('Drop your audio files here.')}</p>
        </div>
      )}
    </div>
  );
}
