using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using Microsoft.Win32;
namespace Wave.Windows;

public partial class MainWindow : Window
{
    private readonly Library repository;
    private readonly LyricsClient client = new();
    private List<Song> tracks = [], queue = [], visible = [];
    private List<NativePlaylist> playlists = [];
    private List<Play> plays = [];
    private readonly List<NativeMoodSignal> moodSignals = [];
    private string remixPeriod = "weekly";
    private double heard, heardMark;
    private bool hearing, listeningRecorded;
    private DateTime heardFrom = DateTime.UtcNow;
    private int index = -1;
    private string page = "Home", previousPage = "Home", repeat = "off";
    private string? collection;
    private MediaPlayer active = new();
    private MediaPlayer? spare, outgoing;
    private bool ready, spareReady, playing, initialized, lookingUp, lyricsVisible = true, preferencesDirty;


    private const uint EsContinuous = 0x80000000;
    private const uint EsSystemRequired = 0x00000001;
    private const uint EsDisplayRequired = 0x00000002;
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint SetThreadExecutionState(uint esFlags);
    private void UpdateScreenWakeLock(bool keepAwake)
    {
        try { SetThreadExecutionState(keepAwake ? (EsContinuous | EsDisplayRequired | EsSystemRequired) : EsContinuous); }
        catch {                                 }
    }
    private double fadeLength, fadeCue, volume = .8, beforeMute = .8;
    private NativeEndingShape fadeEnding = NativeEndingShape.FadeToZero;
    private long lastVolumeFeedback;
    private bool syncingVolume;
    private DispatcherTimer? repeatAttack;
    private Preferences preferences = new(Mix: true);
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    private readonly SleepTimer sleepTimer = new();
    private readonly DispatcherTimer sleepTick = new() { Interval = TimeSpan.FromSeconds(1) };
    private TextBlock? sleepStatus;
    private void SetSleepTimer(int minutes)
    {
        sleepTimer.Set(minutes, DateTimeOffset.UtcNow);
        sleepTick.Stop();
        sleepTick.Tick -= SleepTimerTick;
        if (minutes > 0) { sleepTick.Tick += SleepTimerTick; sleepTick.Start(); }
        UpdateSleepStatus();
    }
    private void UpdateSleepStatus()
    {
        if (sleepStatus == null) return;
        int remaining = sleepTimer.RemainingMinutes(DateTimeOffset.UtcNow);
        sleepStatus.Text = remaining > 0
            ? Localization.T("Music will pause in about {minutes} min.", new Dictionary<string, string> { ["minutes"] = remaining.ToString() })
            : Localization.T("Sleep timer is off.");
    }
    private void SleepTimerTick(object? sender, EventArgs e)
    {
        if (sleepTimer.Expired(DateTimeOffset.UtcNow)) {
            sleepTimer.Cancel(); sleepTick.Stop(); sleepTick.Tick -= SleepTimerTick;
            if (playing) { CancelFade(); active.Pause(); playing = false; UpdatePlaybackLabels(); }
            Notify(Localization.T("The sleep timer stopped the music."));
        }
        UpdateSleepStatus();
    }

    private DateTime lastSave = DateTime.UtcNow;
    private List<(double Time, string Text)> lines = [];
    private int highlighted = -2;
    private Song? Current => index >= 0 && index < queue.Count ? queue[index] : null;
    private bool MixEnabled => preferences.Mix ?? preferences.Crossfade > 0;
    private TextBox? searchBox;
    private string searchQuery = "";
    private string? artShown;
    private string renderedPage = "";
    private long navigationVersion;
    private bool railNarrow;
    private int layoutTier = -1;
    private NativeDeviceProfile profile = NativeDeviceProfile.Full;
    private DateTime lastInteraction = DateTime.UtcNow;
    private bool idleStageVisible;
    private NativeRemixMetrics RemixLayout => NativeLayout.Remix(
        Math.Max(460, ActualWidth), Math.Max(480, ActualHeight), FontSize / 15.0, profile);

    public MainWindow() : this(null) { }
    public MainWindow(string? folder)
    {
        repository = new Library(folder);
        InitializeComponent();
        PreviewKeyDown += PlayerShortcut;
        try {
            tracks = repository.Load(); preferences = repository.LoadPreferences();
            playlists = NativeCollections.Load<List<NativePlaylist>>(repository.Folder, "playlists.json") ?? [];
            plays = Listening.Load(repository.Folder);
        } catch (Exception error) { Notify(Localization.T("Could not open local storage: {message}", new Dictionary<string, string> { ["message"] = error.Message })); }
        ApplyTheme(); Localization.Init(preferences.Language); ApplyLanguage(); volume = Math.Clamp(preferences.Volume, 0, 1); Volume.Value = NowVolume.Value = volume; UpdateSoundButtons();
        initialized = true; Loaded += (_, _) => FitRail(); Loaded += async (_, _) => await CheckForUpdate(); ShowPage("Home"); timer.Tick += Tick; timer.Start();


        var missingArtwork = tracks.Where(s => string.IsNullOrWhiteSpace(s.Artwork)).ToList();
        _ = Task.Run(() => missingArtwork.Select(s => (s.Id, Art: Library.FindFolderArtwork(s.Path))).Where(x => x.Art != null).ToList())
            .ContinueWith(task => {
                if (task.Status != TaskStatus.RanToCompletion || task.Result.Count == 0) return;
                Dispatcher.BeginInvoke(new Action(() => {
                    var covers = task.Result.ToDictionary(x => x.Id, x => x.Art);
                    tracks = tracks.Select(s => string.IsNullOrWhiteSpace(s.Artwork) && covers.TryGetValue(s.Id, out var art) ? s with { Artwork = art } : s).ToList();
                    Refresh();
                }));
            });
        try {
            var session = NativeCollections.Load<ListeningSession>(repository.Folder, "session.json");
            if (session != null) {
                queue = NativeCollections.Resolve(session.Queue, tracks);
                int restored = queue.FindIndex(s => s.Id == session.CurrentId);
                if (restored >= 0) StartSong(restored, false, session.Position);
            }
        } catch (Exception error) { Notify(Localization.T("Could not restore your listening session: {message}", new Dictionary<string, string> { ["message"] = error.Message })); }
    }





    private void UpdateSummary()
    {
        Summary.Text = page switch {
            "Search" => Localization.T("Songs, albums and artists on this device"),
            "Settings" => Localization.T("Playback, appearance, lyrics and storage"),
            "Remix" => Localization.T("The songs you played this week"),
            "Albums" when collection == null => NativeCollections.Count(tracks.Select(AlbumKey).Distinct().Count(), "album"),
            "Artists" when collection == null => NativeCollections.Count(tracks.Select(s => s.Artist).Distinct().Count(), "artist"),
            "Playlists" when collection == null => NativeCollections.Count(playlists.Count, "playlist"),
            "Favorites" => NativeCollections.Count(tracks.Count(s => s.Favorite), "favorite"),


            _ => $"{NativeCollections.Count(tracks.Count, "song")} · {NativeCollections.Count(tracks.Select(AlbumKey).Distinct().Count(), "album")}",
        };
    }





    private void ApplyLanguage()
    {
        NavHomeText.Text = Localization.T("Home");
        NavSearchText.Text = Localization.T("Search");
        NavLibraryText.Text = Localization.T("Library");
        NavRemixText.Text = Localization.T("Remix");
        NavCollectionText.Text = Localization.T("Your collection").ToUpperInvariant();
        NavAlbumsText.Text = Localization.T("Albums");
        NavArtistsText.Text = Localization.T("Artists");
        NavPlaylistsText.Text = Localization.T("Playlists");
        NavFavoritesText.Text = Localization.T("Favorites");
        NavSettingsText.Text = Localization.T("Settings");
        if (NavigationPanel.Content is StackPanel navigation)
            foreach (var button in navigation.Children.OfType<Button>())
                if (button.Tag is string destination)
                    System.Windows.Automation.AutomationProperties.SetName(button, Localization.T(destination));
        ImportButton.ToolTip = StickyImportButton.ToolTip = Localization.T("Add music");
        HeaderSettingsButton.ToolTip = StickySettingsButton.ToolTip = Localization.T("Settings");
        ClosePlayerButton.ToolTip = Localization.T("Close the player");
        NowQueueButton.ToolTip = MiniQueueButton.ToolTip = Localization.T("Queue");
        NowPlayingText.Text = Localization.T("Now playing");
        IdleEyebrow.Text = Localization.T("Now playing");
        NowHint.Text = Localization.T("Choose a song from your library.");
        ShuffleButton.ToolTip = Localization.T("Shuffle");
        FavoriteButton.ToolTip = Localization.T("Favorite");
        PreviousButton.ToolTip = Localization.T("Previous");
        NextButton.ToolTip = MiniNextButton.ToolTip = Localization.T("Next");
        LyricsButton.ToolTip = Localization.T("Lyrics");
        EditButton.ToolTip = Localization.T("Edit song and lyrics");
        MiniOpenButton.ToolTip = Localization.T("Open the player");
        foreach (var button in new[] { ImportButton, StickyImportButton, HeaderSettingsButton, StickySettingsButton, ClosePlayerButton, NowQueueButton, MiniQueueButton, ShuffleButton, PreviousButton, NextButton, MiniNextButton, LyricsButton, EditButton, MiniOpenButton })
            if (button.ToolTip is string label) System.Windows.Automation.AutomationProperties.SetName(button, label);
        Volume.ToolTip = Localization.T("Volume");
        Heading.Text = collection ?? Localization.T(page);
        UpdateSummary(); UpdateRepeat(); UpdatePlaybackLabels(); UpdateSoundButtons();
        if (initialized) { if (page == "Settings") RenderSettings(); else Refresh(); }
    }

    private void SetLanguage(string choice)
    {
        preferences = preferences with { Language = choice };
        preferencesDirty = true;
        Localization.Init(choice);
        ApplyLanguage();
        SaveSession();
    }
    private void Notify(string text) { Message.Text = text; Message.Visibility = text.Length == 0 ? Visibility.Collapsed : Visibility.Visible; }
    private void Safe(Action action) { try { action(); } catch (Exception error) { Notify(error.Message); } }
    private void ScrollTopClick(object sender, RoutedEventArgs e)
    {
        HeaderScroll.ScrollToTop();
        StickySectionDock.Visibility = Visibility.Collapsed;
    }







    private void ContentScrolled(object sender, ScrollChangedEventArgs e)
    {
        double headerClearance = Math.Max(PageHeader.ActualHeight, 84);
        if (!WholePage || e.VerticalOffset < headerClearance)
        {
            StickySectionDock.Visibility = Visibility.Collapsed;
            return;
        }
        var headings = CollectionHeader.Children
            .OfType<FrameworkElement>()
            .Where(el => Equals(el.Tag, "section-heading"))
            .ToList();
        string? activeTitle = null;
        double push = 0;
        for (int i = 0; i < headings.Count; i++)
        {
            var top = headings[i].TranslatePoint(new Point(0, 0), HeaderScroll).Y;
            var bottom = top + Math.Max(headings[i].ActualHeight, 28);

            if (bottom <= 48)
            {
                activeTitle = (headings[i] as DockPanel)?.Children.OfType<TextBlock>().FirstOrDefault()?.Text;
                if (i + 1 < headings.Count)
                {
                    var nextTop = headings[i + 1].TranslatePoint(new Point(0, 0), HeaderScroll).Y;
                    if (nextTop > 0 && nextTop < 78) push = Math.Clamp(78 - nextTop, 0, 36);
                }
            }
            else break;
        }
        if (string.IsNullOrWhiteSpace(activeTitle))
        {
            StickySectionDock.Visibility = Visibility.Collapsed;
            return;
        }
        if (StickySectionTitle.Text != activeTitle)
        {
            StickySectionTitle.Text = activeTitle;
            Motion.Rise(StickySectionTitle, Motion.Enabled(preferences.Animations), 8, 200);
        }
        StickySectionTitle.RenderTransform = new TranslateTransform(0, -push);
        StickySectionActions.Visibility = ActualWidth >= 560 ? Visibility.Visible : Visibility.Collapsed;
        StickySectionDock.Visibility = Visibility.Visible;
    }

    private void NavigateClick(object sender, RoutedEventArgs e) { if (sender is Button { Tag: string destination }) ShowPage(destination); }
    private void ShowPage(string destination, string? group = null)
    {
        // Invalidate delayed completions before changing page, even if WPF has
        // already queued an animation completion on the dispatcher.
        navigationVersion++;
        Motion.Reset(NowView);
        if (destination != "Now playing" && destination != "Settings") previousPage = destination;
        page = destination; collection = group;
        bool expanded = page == "Now playing";
        ApplyRailWidth();
        NavigationPanel.Visibility = PageHeader.Visibility = expanded ? Visibility.Collapsed : Visibility.Visible;
        Heading.Text = collection ?? Localization.T(page);
        UpdateSummary();
        LibraryView.Visibility = page is "Now playing" or "Settings" ? Visibility.Collapsed : Visibility.Visible;
        StickySectionDock.Visibility = Visibility.Collapsed;
        NowView.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        SettingsView.Visibility = page == "Settings" ? Visibility.Visible : Visibility.Collapsed;
        if (NavigationPanel.Content is StackPanel navigation) foreach (var button in navigation.Children.OfType<Button>()) {
            bool selected = Equals(button.Tag, page == "Daily mix" ? "Home" : page);


            if (selected) {
                button.SetResourceReference(Control.BackgroundProperty, "AccentTonalBrush");
                button.SetResourceReference(Control.ForegroundProperty, "AccentBrush");
                button.FontWeight = FontWeights.Bold;
            } else {
                button.ClearValue(Control.BackgroundProperty);
                button.ClearValue(Control.ForegroundProperty);
                button.FontWeight = FontWeights.SemiBold;
            }
        }
        LayoutPage();
        if (expanded && Current == null) {



            NowTitle.Text = Localization.T("Nothing playing");
            NowArtist.Content = "";
            NowHint.Visibility = Visibility.Visible;
        }
        if (expanded) SetLyricsVisibility();
        UpdateDock();
        if (page == "Settings") RenderSettings(); else if (!expanded) Refresh();

        bool changed = page != renderedPage;
        renderedPage = page;
        if (page == "Settings") { if (changed) Motion.Rise(SettingsView, Motion.Enabled(preferences.Animations), 14, 240); }
        else if (expanded) { if (changed) Motion.Rise(NowView, Motion.Enabled(preferences.Animations)); }
        else if (changed) Motion.Rise(LibraryView, Motion.Enabled(preferences.Animations), 14, 240);

    }








    private void WindowResized(object sender, SizeChangedEventArgs e) => FitRail();
    private void FitRail()
    {
        UpdateProfile();
        double width = ActualWidth;
        if (width <= 0) return;
        int tier = width < 640 ? 0 : width < 1000 ? 1 : width < 1800 ? 2 : 3;
        bool narrow = tier <= 1;
        if (tier != layoutTier)
        {
            layoutTier = tier;
            var layout = RemixLayout;
            double fontScale = Math.Clamp(FontSize / 15.0, .85, 1.3);
            Heading.FontSize = Math.Clamp(layout.TitleSize * 1.2, 26, 48) * fontScale;
            Summary.FontSize = Math.Clamp(12 + width * .0015, 12, 16) * fontScale;
            WorkspaceGrid.Margin = tier switch
            {
                0 => new Thickness(4, 12, layout.Padding * .6, 8),
                1 => new Thickness(8, 16, layout.Padding, 10),
                2 => new Thickness(10, 22, layout.Padding, 10),
                _ => new Thickness(18, 26, layout.Padding, 14),
            };
            PageHeader.Margin = tier == 0 ? new Thickness(4, 0, 0, 12) : new Thickness(8, 0, 0, 18);
        }
        if (narrow != railNarrow)
        {
            railNarrow = narrow;
            if (NavigationPanel.Content is StackPanel rail)
            {
                rail.Margin = narrow ? new Thickness(6, 20, 6, 14) : new Thickness(16, 24, 12, 18);
                foreach (var element in rail.Children.OfType<FrameworkElement>())
                {
                    if (element is Button button && button.Content is StackPanel content)
                    {
                        foreach (var label in content.Children.OfType<TextBlock>())
                            label.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
                        button.HorizontalContentAlignment = narrow ? HorizontalAlignment.Center : HorizontalAlignment.Left;
                    }
                    else if (element is TextBlock or Viewbox)
                    {


                        element.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
                    }
                }
            }
        }
        ApplyRailWidth();
    }
    private void UpdateProfile()
    {
        double memoryGB = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / 1_073_741_824.0;
        double scale = PresentationSource.FromVisual(this)?.CompositionTarget?.TransformToDevice.M11 ?? 1;
        profile = NativePerformance.Profile(new DeviceSignals(
            memoryGB,
            Environment.ProcessorCount,
            !preferences.Animations,
            false,
            scale,
            ActualWidth < 700));
        if (IdleGlow != null)
            IdleGlow.Visibility = NativePerformance.AmbientMotion(profile) ? Visibility.Visible : Visibility.Collapsed;
    }

    private void NoteInteraction()
    {
        lastInteraction = DateTime.UtcNow;
        HideIdleStage();
    }
    private void PointerInteracted(object sender, MouseEventArgs e) => NoteInteraction();
    private void ButtonInteracted(object sender, MouseButtonEventArgs e) => NoteInteraction();

    private void HideIdleStage()
    {
        if (!idleStageVisible) return;
        IdleStage.Visibility = Visibility.Collapsed;
        idleStageVisible = false;
    }


    private void UpdateIdleStage()
    {
        if (!initialized || !playing || page != "Now playing" || Current is not Song song ||
            DateTime.UtcNow - lastInteraction < TimeSpan.FromSeconds(30))
        {
            HideIdleStage();
            return;
        }
        if (!idleStageVisible)
        {
            IdleStage.Visibility = Visibility.Visible;
            idleStageVisible = true;
        }
        double time = active.Position.TotalSeconds;
        double duration = Math.Max(1, Seek.Maximum);
        IdleTitle.Text = song.Title;
        IdleArtist.Text = song.Artist;
        IdleAlbum.Text = song.Album;
        IdleAlbum.Visibility = string.IsNullOrWhiteSpace(song.Album) ? Visibility.Collapsed : Visibility.Visible;
        IdleClock.Text = $"{Clock(time)} / {Clock(duration)}   −{Clock(Math.Max(0, duration - time))}";
        IdleMix.Text = MixEnabled ? Localization.T("Mix") : string.Empty;
        IdleArt.Background = ArtworkBrush(song.Artwork);
        double trackWidth = IdleTrack.ActualWidth > 0 ? IdleTrack.ActualWidth : Math.Max(320, ActualWidth * .5);
        IdleProgress.Width = trackWidth * Math.Clamp(time / duration, 0, 1);
    }

    private void ApplyRailWidth()
    {
        double width = page == "Now playing"
            ? 0
            : layoutTier switch
            {
                0 => 62,
                1 => 84,
                3 => 240,
                _ => 216,
            };
        SidebarWidth.Width = new GridLength(width);
    }







    private bool WholePage => page is "Home" or "Remix";
    private void LayoutPage()
    {
        bool whole = WholePage;
        LibraryView.RowDefinitions[0].Height = whole ? new GridLength(1, GridUnitType.Star) : GridLength.Auto;
        LibraryView.RowDefinitions[1].Height = whole ? GridLength.Auto : new GridLength(1, GridUnitType.Star);
        HeaderScroll.MaxHeight = whole ? double.PositiveInfinity : 300;
        Songs.Visibility = whole ? Visibility.Collapsed : Visibility.Visible;
        UpdateDock();
    }
    private void UpdateDock()
    {
        bool show = Current != null && page != "Now playing";
        MiniPlayer.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        MiniHeight.Height = new GridLength(show ? 92 : 0);
    }
    private static readonly string[] AudioExtensions = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wma", ".aiff", ".aif"];






    private void ImportClick(object sender, RoutedEventArgs e)
    {
        var menu = new ContextMenu();
        var files = new MenuItem { Header = Localization.T("Choose files…") };
        files.Click += async (_, _) => await ImportFiles();
        var folder = new MenuItem { Header = Localization.T("Choose a folder…") };
        folder.Click += async (_, _) => await ImportFolder();
        menu.Items.Add(files);
        menu.Items.Add(folder);
        menu.PlacementTarget = sender as UIElement;
        menu.IsOpen = true;
    }

    private async Task ImportFiles()
    {
        var picker = new OpenFileDialog { Multiselect = true, Filter = "Audio|*.mp3;*.wav;*.flac;*.m4a;*.aac;*.ogg;*.oga;*.opus;*.wma;*.aiff;*.aif" };
        if (picker.ShowDialog() != true) return;
        await ImportPaths(picker.FileNames);
    }

    private async Task ImportFolder()
    {
        var picker = new OpenFolderDialog { Title = Localization.T("Choose a folder of music"), Multiselect = false };
        if (picker.ShowDialog() != true) return;
        var watched = (preferences.WatchedFolders ?? []).ToList();
        if (!watched.Any(f => string.Equals(f, picker.FolderName, StringComparison.OrdinalIgnoreCase))) {
            watched.Add(picker.FolderName);
            preferences = preferences with { WatchedFolders = watched };
            preferencesDirty = true;
            SaveSession();
        }
        await ImportFolderPath(picker.FolderName);
    }

    private async Task ImportFolderPath(string folderPath)
    {
        string[] found;
        try { found = Directory.EnumerateFiles(folderPath, "*", SearchOption.AllDirectories).ToArray(); }
        catch (Exception error) { Notify(error.Message); return; }


        var usable = found
            .Where(path => AudioExtensions.Contains(System.IO.Path.GetExtension(path).ToLowerInvariant()))
            .Where(path => { try { var length = new FileInfo(path).Length; return length > 0 && length <= 209715200; } catch { return false; } })
            .ToArray();
        if (usable.Length == 0) { Notify(Localization.T("No music files in that folder.")); return; }
        await ImportPaths(usable);
    }

    private async Task RescanWatchedFolders()
    {
        var folders = (preferences.WatchedFolders ?? []).Where(Directory.Exists).ToList();
        if (folders.Count == 0) { Notify(Localization.T("No remembered folders are available right now.")); return; }
        var usable = new List<string>();
        foreach (var folder in folders) {
            try {
                usable.AddRange(Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories)
                    .Where(path => AudioExtensions.Contains(System.IO.Path.GetExtension(path).ToLowerInvariant()))
                    .Where(path => { try { var length = new FileInfo(path).Length; return length > 0 && length <= 209715200; } catch { return false; } }));
            } catch {                                              }
        }
        if (usable.Count == 0) { Notify(Localization.T("No music files found in remembered folders.")); return; }
        await ImportPaths(usable);
    }

    private bool importingFiles;
    private async Task ImportPaths(IEnumerable<string> paths)
    {
        if (importingFiles) return;
        importingFiles = true;
        var list = paths.ToArray();
        try {
            Notify(Localization.T("Adding {count}…", new Dictionary<string, string> { ["count"] = $"{list.Length} {(list.Length == 1 ? Localization.T("file") : Localization.T("files"))}" }));
            int added = await repository.Import(list, preferences.CopyFilesToLibrary, preferences.CustomAudioFolder);
            tracks = repository.Load(); Notify(Localization.T("{count} tracks added; identical files skipped.", new Dictionary<string, string> { ["count"] = added.ToString() })); Refresh();
        } catch (Exception error) { tracks = repository.Load(); Refresh(); Notify(error.Message); }
        finally { importingFiles = false; }
    }

    private void RemoveFromLibrary(Song song)
    {
        bool wasCurrent = Current?.Id == song.Id;
        if (wasCurrent) { CancelFade(); active.Stop(); active.Close(); playing = false; ready = false; UpdateScreenWakeLock(false); }
        repository.Remove(song.Id, preferences);
        tracks = repository.Load();
        queue.RemoveAll(s => s.Id == song.Id);
        if (index >= queue.Count) index = queue.Count - 1;
        Refresh();
        UpdatePlaybackLabels();
        Notify(Localization.T("Removed from Wave library. Your original file was kept."));
    }
    private void ArtworkPlayClick(object sender, MouseButtonEventArgs e) { if (sender is Border { Tag: Song song }) { PlayCollection(visible, song.Id); e.Handled = true; } }
    private void ToggleArtwork(object sender, MouseButtonEventArgs e) { ToggleClick(sender, e); e.Handled = true; }
    private void SongPlayClick(object sender, RoutedEventArgs e) { if (sender is Button { Tag: Song song }) PlayCollection(visible, song.Id); }
    private void SongDoubleClick(object sender, MouseButtonEventArgs e) { if (e.OriginalSource is DependencyObject source && FindParent<Button>(source) == null && Songs.SelectedItem is Song song) PlayCollection(visible, song.Id); }
    private static T? FindParent<T>(DependencyObject? node) where T : DependencyObject { while (node != null) { if (node is T found) return found; node = VisualTreeHelper.GetParent(node); } return null; }
    private void SongArtistClick(object sender, RoutedEventArgs e) { if (sender is Button { Tag: Song song }) ShowPage("Artists", song.Artist); }
    private void SongAlbumClick(object sender, RoutedEventArgs e) { if (sender is Button { Tag: Song song }) ShowPage("Albums", AlbumKey(song)); }
    private void SongFavoriteClick(object sender, RoutedEventArgs e) { if (sender is Button { Tag: Song song }) Safe(() => Update(song with { Favorite = !song.Favorite })); }
    private void PlayCollection(IEnumerable<Song> songs, string id) { queue = songs.ToList(); Play(queue.FindIndex(s => s.Id == id)); }
    private void Play(int position) => StartSong(position, true, 0);
    private MediaPlayer Create()
    {
        var player = new MediaPlayer();
        player.MediaEnded += (_, _) => { if (ReferenceEquals(active, player)) Advance(true); };
        player.MediaFailed += (_, args) => { if (!ReferenceEquals(active, player)) return; playing = false; UpdatePlaybackLabels(); Notify(Localization.T("This file cannot be decoded: {message}", new Dictionary<string, string> { ["message"] = args.ErrorException.Message })); };
        return player;
    }
    private void StartSong(int position, bool startPlaying, double restored)
    {
        if (position < 0 || position >= queue.Count) return;

        if (Current is { } leaving && heard >= 2)
        {
            moodSignals.Add(new NativeMoodSignal(
                leaving.Id, (int)Math.Round(heard), Math.Max(leaving.Duration, Seek.Maximum),
                ready && active.Position.TotalSeconds >= Seek.Maximum - 1.5,
                new DateTimeOffset(heardFrom).ToUnixTimeMilliseconds()));
            if (moodSignals.Count > 32) moodSignals.RemoveRange(0, moodSignals.Count - 32);
        }
        heard = 0; hearing = false; listeningRecorded = false;
        CancelFade(); active.Close(); spare?.Close(); spare = null; spareReady = ready = false;
        index = position; var song = queue[index];
        if (!File.Exists(song.Path)) {
            playing = false; UpdatePlaybackLabels();
            Notify(Localization.T("File not found at its original location: {file}", new Dictionary<string, string> { ["file"] = song.FileName }));
            return;
        }
        active = Create(); var selected = active;
        selected.MediaOpened += async (_, _) => {
            if (!ReferenceEquals(selected, active)) return;
            ready = true; double duration = selected.NaturalDuration.HasTimeSpan ? selected.NaturalDuration.TimeSpan.TotalSeconds : song.Duration;
            Seek.Maximum = Math.Max(1, duration); selected.Position = TimeSpan.FromSeconds(Math.Clamp(double.IsFinite(restored) ? restored : 0, 0, Math.Max(0, duration - .1)));
            selected.Volume = volume; playing = startPlaying;
            if (startPlaying) selected.Play();
            PrepareNext(); UpdatePlaybackLabels();
            if (preferences.OnlineLyrics && song.Lyrics.Length == 0) await Lookup(song);
        };
        selected.Open(Library.SafeFileUri(song.Path)); playing = false; UpdateCurrent(); UpdateDock();
    }
    private void PrepareNext()
    {
        if (outgoing != null) return;
        spare?.Close(); spare = null; spareReady = false;
        if (!MixEnabled || repeat == "one" || index + 1 >= queue.Count) return;
        var nextSong = queue[index + 1];
        if (!File.Exists(nextSong.Path)) return;
        try {
            spare = Create(); var next = spare; next.Volume = 0;
            next.MediaOpened += (_, _) => { if (ReferenceEquals(spare, next)) spareReady = true; };
            next.Open(Library.SafeFileUri(nextSong.Path));
        } catch { spare?.Close(); spare = null; spareReady = false; }
    }
    private void CancelFade() { repeatAttack?.Stop(); repeatAttack = null; outgoing?.Close(); outgoing = null; fadeCue = 0; fadeEnding = NativeEndingShape.FadeToZero; active.Volume = volume; }
    private void Tick(object? sender, EventArgs e)
    {
        if (!ready) { HideIdleStage(); return; }
        UpdateIdleStage();
        double time = active.Position.TotalSeconds;
        CountListening(time);
        if (!Seek.IsMouseCaptureWithin && !Seek.IsKeyboardFocusWithin) Seek.Value = time;
        Elapsed.Text = Clock(time); Duration.Text = Clock(Seek.Maximum);
        if (playing && outgoing != null) {
            double fraction = Math.Clamp((time - fadeCue) / Math.Max(.1, fadeLength), 0, 1);
            var (outgoingGain, incomingGain) = NativeEnding.Gains(fraction, fadeEnding);
            outgoing.Volume = volume * outgoingGain; active.Volume = volume * incomingGain;
            if (fraction >= NativeEnding.Cut(fadeEnding)) {
                outgoing.Close(); outgoing = null; fadeCue = 0; active.Volume = volume; PrepareNext();
            }
        } else if (playing && spareReady && spare != null && active.NaturalDuration.HasTimeSpan && spare.NaturalDuration.HasTimeSpan) {
            double window = NativeCollections.MixWindow(active.NaturalDuration.TimeSpan.TotalSeconds, spare.NaturalDuration.TimeSpan.TotalSeconds);
            double remaining = active.NaturalDuration.TimeSpan.TotalSeconds - time;
            var outgoingSong = Current is Song song ? song : null;
            var ending = outgoingSong == null ? NativeEndingShape.FadeToZero : NativeEnding.Detect(outgoingSong);
            window = Math.Min(window, spare.NaturalDuration.TimeSpan.TotalSeconds);
            if (remaining > 0 && remaining <= window) {
                fadeEnding = ending;
                fadeLength = remaining;
                fadeCue = 0;
                outgoing = active; active = spare; spare = null; spareReady = false; index++;
                heard = 0; hearing = false; listeningRecorded = false;
                active.Position = TimeSpan.FromSeconds(fadeCue); active.Volume = 0; active.Play(); Seek.Maximum = active.NaturalDuration.TimeSpan.TotalSeconds;
                UpdateCurrent(); time = fadeCue;
                if (preferences.OnlineLyrics && Current is { Lyrics.Length: 0 } nextSong) _ = Lookup(nextSong);
            }
        }
        int at = lines.FindLastIndex(line => line.Time <= time);
        if (at != highlighted) {
            int previous = highlighted;
            highlighted = at;


            if (previous >= 0 && previous < LyricsLines.Children.Count && LyricsLines.Children[previous] is TextBlock before)
                StyleLine(before, false);
            if (at >= 0 && at < LyricsLines.Children.Count && LyricsLines.Children[at] is TextBlock current) {
                StyleLine(current, true);
                if (page == "Now playing") current.BringIntoView();
            }
        }
        if (at >= 0 && at < LyricsLines.Children.Count && LyricsLines.Children[at] is TextBlock currentLine) {
            double end = at + 1 < lines.Count ? lines[at + 1].Time : Seek.Maximum;
            double fill = Math.Clamp((time - lines[at].Time) / Math.Max(.1, end - lines[at].Time), 0, 1);
            Color accent = ((SolidColorBrush)Application.Current.Resources["AccentBrush"]).Color;
            Color muted = ((SolidColorBrush)Application.Current.Resources["MutedBrush"]).Color;
            currentLine.Foreground = new LinearGradientBrush(new GradientStopCollection { new(accent, Math.Max(0, fill - .02)), new(muted, Math.Min(1, fill + .02)) }, 0);
        }
        if (DateTime.UtcNow - lastSave > TimeSpan.FromSeconds(5)) { SaveSession(); lastSave = DateTime.UtcNow; }
    }








    private void CountListening(double time)
    {
        if (Current is not { } song || !playing) { hearing = false; return; }
        if (!hearing) { hearing = true; if (heard == 0) heardFrom = DateTime.UtcNow; heardMark = time; return; }
        double step = time - heardMark;
        if (step is > 0 and <= 2.5) heard += step;
        heardMark = time;
        if (listeningRecorded || heard < Listening.Threshold(Seek.Maximum)) return;
        int seconds = (int)heard;
        bool completed = ready && time >= Seek.Maximum - 1;
        listeningRecorded = true;
        RecordPlay(song, seconds, completed);
    }
    private void RecordPlay(Song song, int seconds, bool completed)
    {
        Safe(() => {
            long at = new DateTimeOffset(heardFrom).ToUnixTimeMilliseconds();
            plays = Listening.Add(repository.Folder, plays, new Play(song.Id, at, seconds, completed));
            moodSignals.Add(new NativeMoodSignal(song.Id, seconds, Math.Max(song.Duration, Seek.Maximum), completed, at));
            if (moodSignals.Count > 32) moodSignals.RemoveRange(0, moodSignals.Count - 32);
            Update(song with { PlayCount = song.PlayCount + 1, LastPlayed = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
            if (page == "Remix" || page == "Home") Refresh();
        });
    }
    private ListeningSummary ListeningNow() => Listening.Summarise(plays, tracks, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());




    private void StyleLine(TextBlock line, bool sung) {
        line.SetResourceReference(TextBlock.ForegroundProperty, sung ? "AccentBrush" : "MutedBrush");
        line.FontWeight = sung ? FontWeights.Bold : FontWeights.Normal;
        line.Opacity = sung ? 1 : .62;
    }
    private static string Clock(double seconds) { if (!double.IsFinite(seconds) || seconds < 0) seconds = 0; return $"{(int)seconds / 60}:{(int)seconds % 60:00}"; }
    private void UpdatePlaybackLabels()
    {
        ShuffleButton.IsEnabled = RepeatButton.IsEnabled = FavoriteButton.IsEnabled = Current != null;
        Iconography.Set(NowToggle, playing ? "pause" : "play", 22);
        Iconography.Set(MiniToggle, playing ? "pause" : "play", 18);
        NowToggle.ToolTip = MiniToggle.ToolTip = Localization.T(playing ? "Pause" : "Play");
        System.Windows.Automation.AutomationProperties.SetName(NowToggle, Localization.T(playing ? "Pause" : "Play"));
        System.Windows.Automation.AutomationProperties.SetName(MiniToggle, Localization.T(playing ? "Pause" : "Play"));
        UpdateScreenWakeLock(playing && Current != null);
    }
    private void UpdateCurrent()
    {
        if (Current == null) return;
        MiniTitle.Text = NowTitle.Text = Current.Title; MiniArtist.Text = Current.Artist; NowArtist.Content = Current.Artist; NowHint.Visibility = Visibility.Collapsed;
        NowArt.Background = ArtworkBrush(Current.Artwork); ArtPlaceholder.Visibility = Current.Artwork == null ? Visibility.Visible : Visibility.Collapsed;
        MiniArt.Background = ArtworkBrush(Current.Artwork);


        if (artShown != Current.Id) { Motion.Settle(NowArt, Motion.Enabled(preferences.Animations)); artShown = Current.Id; }
        if (MiniArt.Child is TextBlock note) note.Visibility = Current.Artwork == null ? Visibility.Visible : Visibility.Collapsed;
        FavoriteButton.ToolTip = Localization.T(Current.Favorite ? "Unfavorite current track" : "Favorite current track");
        System.Windows.Automation.AutomationProperties.SetName(FavoriteButton, FavoriteButton.ToolTip.ToString());
        if (Current.Favorite) FavoriteButton.SetResourceReference(Control.ForegroundProperty, "AccentBrush");
        else FavoriteButton.ClearValue(Control.ForegroundProperty);
        UpdatePlaybackLabels(); RenderLyrics();
    }
    private ImageBrush? LoadImage(string? path) { try { if (path == null || !File.Exists(path)) return null; var image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.DecodePixelWidth = 600; image.UriSource = Library.SafeFileUri(path); image.EndInit(); image.Freeze(); return new ImageBrush(image) { Stretch = Stretch.UniformToFill }; } catch { return null; } }
    private Brush ArtworkBrush(string? path) => LoadImage(path) ?? (Brush)Application.Current.Resources["TonalBrush"];
    private void PlayerShortcut(object sender, KeyEventArgs e)
    {
        NoteInteraction();
        if (page != "Now playing" || !ready || Keyboard.Modifiers != ModifierKeys.None || e.IsRepeat) return;
        if (e.OriginalSource is TextBox or System.Windows.Controls.Primitives.ButtonBase or System.Windows.Controls.Primitives.RangeBase) return;
        switch (e.Key)
        {
            case Key.Space: ToggleClick(this, new RoutedEventArgs()); break;
            case Key.Left: active.Position = TimeSpan.FromSeconds(Math.Max(0, active.Position.TotalSeconds - 5)); break;
            case Key.Right: active.Position = TimeSpan.FromSeconds(Math.Min(Seek.Maximum, active.Position.TotalSeconds + 5)); break;
            case Key.Up: Volume.Value = Math.Min(1, Volume.Value + .05); break;
            case Key.Down: Volume.Value = Math.Max(0, Volume.Value - .05); break;
            case Key.M: SoundClick(SoundButton, new RoutedEventArgs()); break;
            default: return;
        }
        e.Handled = true;
    }

    private void ToggleClick(object sender, RoutedEventArgs e) { if (!ready) return; CancelFade(); if (playing) active.Pause(); else { if (active.Position.TotalSeconds >= Seek.Maximum - .1) active.Position = TimeSpan.Zero; active.Play(); PrepareNext(); } playing = !playing; UpdatePlaybackLabels(); }
    private void Advance(bool ended = false)
    {
        if (ended && (repeat == "one" || (repeat == "all" && queue.Count == 1))) {
            heard = 0; hearing = false; listeningRecorded = false;
            CancelFade();
            var deck = active;
            deck.Position = TimeSpan.Zero;
            deck.Volume = 0;
            deck.Play();
            var started = System.Diagnostics.Stopwatch.StartNew();
            var attack = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            repeatAttack = attack;
            attack.Tick += (_, _) => {
                if (active != deck || !playing) { attack.Stop(); return; }
                var progress = Math.Clamp(started.Elapsed.TotalSeconds / .22, 0, 1);
                deck.Volume = volume * progress;
                if (progress >= 1) { attack.Stop(); repeatAttack = null; }
            };
            attack.Start();
            return;
        }
        if (index + 1 < queue.Count) Play(index + 1);
        else if (repeat == "all" && queue.Count > 0) Play(0);
        else if (preferences.Autoplay && Current != null && tracks.Any(s => s.Id != Current.Id)) {
            var recentSignals = plays.TakeLast(32)
                .Select(p => new NativeMoodSignal(p.SongId, p.Seconds, tracks.Find(t => t.Id == p.SongId)?.Duration ?? 0, p.Completed, p.At))
                .Concat(moodSignals)
                .ToList();
            var next = NativeMood.PickAutoplayNext(tracks, Current, queue.Select(s => s.Id), recentSignals);
            if (next != null) {
                queue.RemoveAll(s => s.Id == next.Id);
                queue.Add(next);
                Play(queue.Count - 1);
            }
        } else { active.Pause(); playing = false; CancelFade(); UpdatePlaybackLabels(); }
    }
    private void NextClick(object sender, RoutedEventArgs e) => Advance();
    private void PreviousClick(object sender, RoutedEventArgs e) { if (!ready) return; CancelFade(); if (active.Position.TotalSeconds > 3 || index == 0) active.Position = TimeSpan.Zero; else if (index > 0) Play(index - 1); }
    private void SeekReleased(object sender, MouseButtonEventArgs e) => SeekToSlider();
    private void SeekKey(object sender, KeyEventArgs e) => SeekToSlider();
    private void SeekToSlider() { if (!ready) return; CancelFade(); active.Position = TimeSpan.FromSeconds(Seek.Value); }
    private void UpdateSoundButtons()
    {
        foreach (var button in new[] { SoundButton, NowSoundButton }) {
            Iconography.Set(button, volume > 0 ? "volume" : "mute", 20);
            button.ToolTip = Localization.T(volume > 0 ? "Mute" : "Unmute");
            System.Windows.Automation.AutomationProperties.SetName(button, button.ToolTip.ToString());
        }
        Volume.ToolTip = NowVolume.ToolTip = Localization.T("Volume");
        System.Windows.Automation.AutomationProperties.SetName(Volume, Localization.T("Volume"));
        System.Windows.Automation.AutomationProperties.SetName(NowVolume, Localization.T("Volume"));
    }
    private void SoundClick(object sender, RoutedEventArgs e)
    {
        if (volume > 0) { beforeMute = volume; Volume.Value = 0; }
        else Volume.Value = Math.Clamp(beforeMute, .01, 1);
        if (sender is Button button) Motion.IconAction(button, Motion.Enabled(preferences.Animations), "volume");
    }
    private void VolumeChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!initialized || syncingVolume || !double.IsFinite(e.NewValue)) return;
        bool changedMute = (volume == 0) != (e.NewValue == 0);
        if (volume > 0 && e.NewValue == 0) beforeMute = volume;
        volume = Math.Clamp(e.NewValue, 0, 1);
        syncingVolume = true;
        try {
            if (Volume.Value != volume) Volume.Value = volume;
            if (NowVolume.Value != volume) NowVolume.Value = volume;
        } finally { syncingVolume = false; }
        preferences = preferences with { Volume = volume }; preferencesDirty = true;
        if (outgoing == null) active.Volume = volume;
        if (changedMute) UpdateSoundButtons();
        if (Environment.TickCount64 - lastVolumeFeedback > 120) {
            lastVolumeFeedback = Environment.TickCount64;
            Motion.IconAction(SoundButton, Motion.Enabled(preferences.Animations), "volume");
            Motion.IconAction(NowSoundButton, Motion.Enabled(preferences.Animations), "volume");
        }
    }
    private void FavoriteClick(object sender, RoutedEventArgs e) { if (Current != null) Safe(() => Update(Current with { Favorite = !Current.Favorite })); Motion.IconAction(FavoriteButton, Motion.Enabled(preferences.Animations), "favorite"); }
    private void ShuffleClick(object sender, RoutedEventArgs e) { if (Current == null) return; var id = Current.Id; queue = new[] { Current }.Concat(queue.Where(s => s.Id != id).OrderBy(_ => Random.Shared.Next())).ToList(); index = 0; CancelFade(); PrepareNext(); Motion.IconAction(ShuffleButton, Motion.Enabled(preferences.Animations), "shuffle"); Notify(Localization.T("Upcoming songs shuffled.")); }
    private void RepeatClick(object sender, RoutedEventArgs e) { repeat = repeat == "off" ? "all" : repeat == "all" ? "one" : "off"; UpdateRepeat(); Motion.IconAction(RepeatButton, Motion.Enabled(preferences.Animations), "repeat"); PrepareNext(); }

    private void UpdateRepeat()
    {
        RepeatButton.ToolTip = Localization.T("Repeat: " + repeat);
        System.Windows.Automation.AutomationProperties.SetName(RepeatButton, RepeatButton.ToolTip.ToString());
        var icon = Iconography.Draw("repeat", 20);
        if (repeat == "one") {
            var stack = new Grid();
            stack.Children.Add(icon);
            stack.Children.Add(new TextBlock { Text = "1", FontSize = 9, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = (Brush)Application.Current.Resources["InkBrush"] });
            RepeatButton.Content = stack;
        } else RepeatButton.Content = icon;
        if (repeat == "off") RepeatButton.ClearValue(Control.ForegroundProperty);
        else RepeatButton.SetResourceReference(Control.ForegroundProperty, "AccentBrush");
    }
    private void NowClick(object sender, RoutedEventArgs e) { if (Current != null) ShowPage("Now playing"); }
    private void CollapseClick(object sender, RoutedEventArgs e) => CollapsePlayer(Motion.Enabled(preferences.Animations));
    private void CollapsePlayer(bool enabled)
    {
        var version = ++navigationVersion;
        var destination = previousPage;
        Motion.CollapseToMini(NowView, enabled, () => {
            if (navigationVersion == version && page == "Now playing") ShowPage(destination);
        });
    }
    private void NowArtistClick(object sender, RoutedEventArgs e) { if (Current != null) ShowPage("Artists", Current.Artist); }
    private void LyricsToggleClick(object sender, RoutedEventArgs e) { lyricsVisible = !lyricsVisible; SetLyricsVisibility(); }
    private void SetLyricsVisibility() { bool show = lyricsVisible && Current?.Lyrics.Length > 0; LyricsScroll.Visibility = show ? Visibility.Visible : Visibility.Collapsed; LyricsWidth.Width = new GridLength(show ? 1 : 0, GridUnitType.Star); }
    private void ArtHostChanged(object sender, SizeChangedEventArgs e) { double side = Math.Max(64, Math.Min(e.NewSize.Width, e.NewSize.Height - 100)); NowArt.Width = NowArt.Height = side; }
    private void Update(Song song)
    {
        var updated = tracks.Select(item => item.Id == song.Id ? song : item).ToList(); repository.Save(updated); tracks = updated;
        queue = queue.Select(item => item.Id == song.Id ? song : item).ToList();
        Refresh(); if (Current?.Id == song.Id) UpdateCurrent();
    }
    private async Task Lookup(Song song)
    {
        if (lookingUp) return; lookingUp = true;
        try { string text = await client.Find(song); var latest = tracks.Find(s => s.Id == song.Id);
            if (latest != null && latest.Title == song.Title && latest.Artist == song.Artist && latest.Lyrics.Length == 0) Update(latest with { Lyrics = text, CheckedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
            Notify(Localization.T(text.Length == 0 ? "No matching lyrics." : "Lyrics saved for offline listening."));
        } catch (Exception error) { Notify(error.Message); } finally { lookingUp = false; }
    }
    private void RenderLyrics()
    {
        LyricsLines.Children.Clear(); lines = LyricsClient.Parse(Current?.Lyrics ?? ""); highlighted = -2; SetLyricsVisibility();
        if (lines.Count == 0) { if (!string.IsNullOrWhiteSpace(Current?.Lyrics)) LyricsLines.Children.Add(Label(Current.Lyrics, 24)); return; }
        foreach (var line in lines) {
            var text = Label(line.Text, 26); text.Margin = new Thickness(0, 14, 0, 14); text.Cursor = Cursors.Hand; text.Opacity = .62;
            text.MouseLeftButtonUp += (_, _) => { if (ready) { CancelFade(); active.Position = TimeSpan.FromSeconds(line.Time); } };
            LyricsLines.Children.Add(text);
        }
    }
    private void SaveSession() => Safe(() => {
        if (Current != null && ready) NativeCollections.Save(repository.Folder, "session.json", new ListeningSession(queue.Select(s => s.Id).ToList(), Current.Id, active.Position.TotalSeconds));
        if (preferencesDirty) { repository.SavePreferences(preferences); preferencesDirty = false; }
    });
    private void WindowKey(object sender, KeyEventArgs e) { NoteInteraction(); if (e.OriginalSource is TextBox) return; if (e.Key == Key.Space && Keyboard.Modifiers == ModifierKeys.None) { ToggleClick(this, e); e.Handled = true; } else if (e.Key == Key.F && Keyboard.Modifiers == ModifierKeys.Control) { ShowPage("Search"); searchBox?.Focus(); e.Handled = true; } }
    private void ClosingWindow(object? sender, System.ComponentModel.CancelEventArgs e) { UpdateScreenWakeLock(false); SaveSession(); timer.Stop(); sleepTick.Stop(); active.Close(); spare?.Close(); outgoing?.Close(); client.Dispose(); }
}
