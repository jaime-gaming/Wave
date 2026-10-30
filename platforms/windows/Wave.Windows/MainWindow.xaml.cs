using System.IO;
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
    private double heard, heardMark;
    private bool hearing;
    private DateTime heardFrom = DateTime.UtcNow;
    private int index = -1;
    private string page = "Home", previousPage = "Home", repeat = "off";
    private string? collection;
    private MediaPlayer active = new();
    private MediaPlayer? spare, outgoing;
    private bool ready, spareReady, playing, initialized, lookingUp, lyricsVisible = true, preferencesDirty;
    private double fadeLength, volume = .8;
    private Preferences preferences = new(Mix: true);
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    private DateTime lastSave = DateTime.UtcNow;
    private List<(double Time, string Text)> lines = [];
    private int highlighted = -2;
    private Song? Current => index >= 0 && index < queue.Count ? queue[index] : null;
    private bool MixEnabled => preferences.Mix ?? preferences.Crossfade > 0;
    private TextBox? searchBox;
    private string searchQuery = "";

    public MainWindow() : this(null) { }
    public MainWindow(string? folder)
    {
        repository = new Library(folder);
        InitializeComponent();
        try {
            tracks = repository.Load(); preferences = repository.LoadPreferences();
            playlists = NativeCollections.Load<List<NativePlaylist>>(repository.Folder, "playlists.json") ?? [];
            plays = Listening.Load(repository.Folder);
        } catch (Exception error) { Notify("Could not open local storage: " + error.Message); }
        ApplyTheme(); volume = Math.Clamp(preferences.Volume, 0, 1); Volume.Value = volume;
        initialized = true; ShowPage("Home"); timer.Tick += Tick; timer.Start();
        try {
            var session = NativeCollections.Load<ListeningSession>(repository.Folder, "session.json");
            if (session != null) {
                queue = NativeCollections.Resolve(session.Queue, tracks);
                int restored = queue.FindIndex(s => s.Id == session.CurrentId);
                if (restored >= 0) StartSong(restored, false, session.Position);
            }
        } catch (Exception error) { Notify("Could not restore your listening session: " + error.Message); }
    }
    /// <summary>
    /// The line under the title says what the page is showing. Settings and Remix
    /// say what is in them; the browsing pages count what is on this device, and a
    /// collection page leaves its own count to the card it shows.
    /// </summary>
    private void UpdateSummary()
    {
        Summary.Text = page switch {
            "Search" => "Songs, albums and artists on this device",
            "Settings" => "Playback, appearance, lyrics and storage",
            "Remix" => "The songs you played this week",
            "Albums" when collection == null => NativeCollections.Count(tracks.Select(AlbumKey).Distinct().Count(), "album"),
            "Artists" when collection == null => NativeCollections.Count(tracks.Select(s => s.Artist).Distinct().Count(), "artist"),
            "Playlists" when collection == null => NativeCollections.Count(playlists.Count, "playlist"),
            "Favorites" => NativeCollections.Count(tracks.Count(s => s.Favorite), "favorite"),
            // A collection page says the same thing as everywhere else, because
            // the card itself counts the collection it is showing.
            _ => $"{NativeCollections.Count(tracks.Count, "song")} · {NativeCollections.Count(tracks.Select(AlbumKey).Distinct().Count(), "album")}",
        };
    }
    private void Notify(string text) { Message.Text = text; Message.Visibility = text.Length == 0 ? Visibility.Collapsed : Visibility.Visible; }
    private void Safe(Action action) { try { action(); } catch (Exception error) { Notify(error.Message); } }
    private void NavigateClick(object sender, RoutedEventArgs e) { if (sender is Button { Tag: string destination }) ShowPage(destination); }
    private void ShowPage(string destination, string? group = null)
    {
        if (destination != "Now playing" && destination != "Settings") previousPage = destination;
        page = destination; collection = group;
        bool expanded = page == "Now playing";
        SidebarWidth.Width = new GridLength(expanded ? 0 : 216);
        NavigationPanel.Visibility = PageHeader.Visibility = expanded ? Visibility.Collapsed : Visibility.Visible;
        Heading.Text = collection ?? page;
        UpdateSummary();
        LibraryView.Visibility = page is "Now playing" or "Settings" ? Visibility.Collapsed : Visibility.Visible;
        NowView.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        SettingsView.Visibility = page == "Settings" ? Visibility.Visible : Visibility.Collapsed;
        if (NavigationPanel.Content is StackPanel navigation) foreach (var button in navigation.Children.OfType<Button>()) {
            bool selected = Equals(button.Tag, page == "Daily mix" ? "Home" : page);
            // The selected place is the only filled one on the rail, and the only
            // one in the accent; the rest read as text until pointed at.
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
        UpdateDock();
        if (page == "Settings") RenderSettings(); else if (!expanded) Refresh();
        if (preferences.Animations) LibraryView.BeginAnimation(OpacityProperty, new DoubleAnimation(.35, 1, TimeSpan.FromMilliseconds(180)));
    }
    /// <summary>
    /// Home, Remix and Settings are pages made of headings, shelves and rows; they
    /// have no song list of their own below the fold, so their opening fills the
    /// card and scrolls as one thing. The library pages have a list, so their
    /// opening stays a short band above it and only the list scrolls — one bar per
    /// page, never two side by side.
    /// </summary>
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
    private async void ImportClick(object sender, RoutedEventArgs e)
    {
        var picker = new OpenFileDialog { Multiselect = true, Filter = "Audio|*.mp3;*.wav;*.flac;*.m4a;*.aac;*.ogg;*.wma;*.aiff" };
        if (picker.ShowDialog() != true) return;
        try {
            Notify("Adding your music…"); int added = await repository.Import(picker.FileNames);
            tracks = repository.Load(); Notify($"{added} tracks added; identical files skipped."); Refresh();
        } catch (Exception error) { tracks = repository.Load(); Refresh(); Notify(error.Message); }
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
        player.MediaFailed += (_, args) => { if (!ReferenceEquals(active, player)) return; playing = false; UpdatePlaybackLabels(); Notify("This file cannot be decoded: " + args.ErrorException.Message); };
        return player;
    }
    private void StartSong(int position, bool startPlaying, double restored)
    {
        if (position < 0 || position >= queue.Count) return;
        CancelFade(); active.Close(); spare?.Close(); spare = null; spareReady = ready = false;
        index = position; active = Create(); var selected = active; var song = queue[index];
        selected.MediaOpened += async (_, _) => {
            if (!ReferenceEquals(selected, active)) return;
            ready = true; double duration = selected.NaturalDuration.HasTimeSpan ? selected.NaturalDuration.TimeSpan.TotalSeconds : song.Duration;
            Seek.Maximum = Math.Max(1, duration); selected.Position = TimeSpan.FromSeconds(Math.Clamp(double.IsFinite(restored) ? restored : 0, 0, Math.Max(0, duration - .1)));
            selected.Volume = volume; playing = startPlaying;
            if (startPlaying) selected.Play();
            PrepareNext(); UpdatePlaybackLabels();
            if (preferences.OnlineLyrics && song.Lyrics.Length == 0) await Lookup(song);
        };
        selected.Open(new Uri(song.Path)); playing = false; UpdateCurrent(); UpdateDock();
    }
    private void PrepareNext()
    {
        if (outgoing != null) return;
        spare?.Close(); spare = null; spareReady = false;
        if (!MixEnabled || repeat == "one" || index + 1 >= queue.Count) return;
        spare = Create(); var next = spare; next.Volume = 0;
        next.MediaOpened += (_, _) => { if (ReferenceEquals(spare, next)) spareReady = true; };
        next.Open(new Uri(queue[index + 1].Path));
    }
    private void CancelFade() { outgoing?.Close(); outgoing = null; active.Volume = volume; }
    private void Tick(object? sender, EventArgs e)
    {
        if (!ready) return;
        double time = active.Position.TotalSeconds;
        CountListening(time);
        if (!Seek.IsMouseCaptureWithin && !Seek.IsKeyboardFocusWithin) Seek.Value = time;
        Elapsed.Text = Clock(time); Duration.Text = Clock(Seek.Maximum);
        if (playing && outgoing != null) {
            double fraction = Math.Clamp(time / fadeLength, 0, 1);
            var (outgoingGain, incomingGain) = NativeCollections.HandoverGains(fraction);
            outgoing.Volume = volume * outgoingGain; active.Volume = volume * incomingGain;
            if (fraction >= 1) { outgoing.Close(); outgoing = null; PrepareNext(); }
        } else if (playing && spareReady && spare != null && active.NaturalDuration.HasTimeSpan && spare.NaturalDuration.HasTimeSpan) {
            double window = NativeCollections.MixWindow(active.NaturalDuration.TimeSpan.TotalSeconds, spare.NaturalDuration.TimeSpan.TotalSeconds);
            double remaining = active.NaturalDuration.TimeSpan.TotalSeconds - time;
            if (remaining > 0 && remaining <= window) {
                fadeLength = remaining; outgoing = active; active = spare; spare = null; spareReady = false; index++;
                active.Position = TimeSpan.Zero; active.Volume = 0; active.Play(); Seek.Maximum = active.NaturalDuration.TimeSpan.TotalSeconds;
                UpdateCurrent(); time = 0;
                if (preferences.OnlineLyrics && Current is { Lyrics.Length: 0 } song) _ = Lookup(song);
            }
        }
        int at = lines.FindLastIndex(line => line.Time <= time);
        if (at != highlighted) {
            int previous = highlighted;
            highlighted = at;
            // Only the line that was sung and the one that now is are touched: a
            // full pass over the lyric block on every line is wasted layout.
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
    /// <summary>
    /// Counts what is heard from the player's own clock.
    ///
    /// The difference between two samples is added and a jump is ignored, so a
    /// seek or a stall never inflates the numbers. A play is written as soon as
    /// the song passes its threshold, not when it ends: a song skipped in its last
    /// ten seconds was still heard.
    /// </summary>
    private void CountListening(double time)
    {
        if (Current is not { } song || !playing) { heard = 0; hearing = false; return; }
        if (!hearing) { hearing = true; heard = 0; heardFrom = DateTime.UtcNow; heardMark = time; return; }
        double step = time - heardMark;
        if (step is > 0 and <= 2.5) heard += step;
        heardMark = time;
        if (heard < Listening.Threshold(Seek.Maximum)) return;
        int seconds = (int)heard;
        bool completed = ready && time >= Seek.Maximum - 1;
        heard = 0;
        heardFrom = DateTime.UtcNow;
        RecordPlay(song, seconds, completed);
    }
    private void RecordPlay(Song song, int seconds, bool completed)
    {
        Safe(() => {
            plays = Listening.Add(repository.Folder, plays, new Play(song.Id,
                new DateTimeOffset(heardFrom).ToUnixTimeMilliseconds(), seconds, completed));
            Update(song with { PlayCount = song.PlayCount + 1, LastPlayed = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
            if (page == "Listening" || page == "Home") Refresh();
        });
    }
    private ListeningSummary ListeningNow() => Listening.Summarise(plays, tracks, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    /// <summary>
    /// One idea of a lyric line: the sung one is hard to miss, the rest stay quiet.
    /// No blur, no shadow — the text does the work.
    /// </summary>
    private void StyleLine(TextBlock line, bool sung) {
        line.SetResourceReference(TextBlock.ForegroundProperty, sung ? "AccentBrush" : "MutedBrush");
        line.FontWeight = sung ? FontWeights.Bold : FontWeights.Normal;
        line.Opacity = sung ? 1 : .62;
    }
    private static string Clock(double seconds) { if (!double.IsFinite(seconds) || seconds < 0) seconds = 0; return $"{(int)seconds / 60}:{(int)seconds % 60:00}"; }
    private void UpdatePlaybackLabels()
    {
        Iconography.Set(NowToggle, playing ? "pause" : "play", 22);
        Iconography.Set(MiniToggle, playing ? "pause" : "play", 18);
        NowToggle.ToolTip = MiniToggle.ToolTip = playing ? "Pause" : "Play";
    }
    private void UpdateCurrent()
    {
        if (Current == null) return;
        MiniTitle.Text = NowTitle.Text = Current.Title; MiniArtist.Text = Current.Artist; NowArtist.Content = Current.Artist;
        NowArt.Background = ArtworkBrush(Current.Artwork); ArtPlaceholder.Visibility = Current.Artwork == null ? Visibility.Visible : Visibility.Collapsed;
        MiniArt.Background = ArtworkBrush(Current.Artwork);
        if (MiniArt.Child is TextBlock note) note.Visibility = Current.Artwork == null ? Visibility.Visible : Visibility.Collapsed;
        if (Current.Favorite) FavoriteButton.SetResourceReference(Control.ForegroundProperty, "AccentBrush");
        else FavoriteButton.ClearValue(Control.ForegroundProperty);
        UpdatePlaybackLabels(); RenderLyrics();
    }
    private ImageBrush? LoadImage(string? path) { try { if (path == null || !File.Exists(path)) return null; var image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.DecodePixelWidth = 600; image.UriSource = new Uri(path); image.EndInit(); image.Freeze(); return new ImageBrush(image) { Stretch = Stretch.UniformToFill }; } catch { return null; } }
    private Brush ArtworkBrush(string? path) => LoadImage(path) ?? (Brush)Application.Current.Resources["TonalBrush"];
    private void ToggleClick(object sender, RoutedEventArgs e) { if (!ready) return; CancelFade(); if (playing) active.Pause(); else { if (active.Position.TotalSeconds >= Seek.Maximum - .1) active.Position = TimeSpan.Zero; active.Play(); PrepareNext(); } playing = !playing; UpdatePlaybackLabels(); }
    private void Advance(bool ended = false)
    {
        if (ended && repeat == "one") { active.Position = TimeSpan.Zero; active.Play(); return; }
        if (index + 1 < queue.Count) Play(index + 1);
        else if (repeat == "all" && queue.Count > 0) Play(0);
        else if (preferences.Autoplay && tracks.Any(s => s.Id != Current?.Id)) {
            var recent = queue.TakeLast(6).Select(s => s.Id).ToHashSet();
            var candidates = tracks.Where(s => !recent.Contains(s.Id)).ToList();
            if (candidates.Count == 0) candidates = tracks.Where(s => s.Id != Current?.Id).ToList();
            var next = candidates[Random.Shared.Next(candidates.Count)]; queue.RemoveAll(s => s.Id == next.Id); queue.Add(next); Play(queue.Count - 1);
        } else { active.Pause(); playing = false; CancelFade(); UpdatePlaybackLabels(); }
    }
    private void NextClick(object sender, RoutedEventArgs e) => Advance();
    private void PreviousClick(object sender, RoutedEventArgs e) { if (!ready) return; CancelFade(); if (active.Position.TotalSeconds > 3 || index == 0) active.Position = TimeSpan.Zero; else if (index > 0) Play(index - 1); }
    private void SeekReleased(object sender, MouseButtonEventArgs e) => SeekToSlider();
    private void SeekKey(object sender, KeyEventArgs e) => SeekToSlider();
    private void SeekToSlider() { if (!ready) return; CancelFade(); active.Position = TimeSpan.FromSeconds(Seek.Value); }
    private void VolumeChanged(object sender, RoutedPropertyChangedEventArgs<double> e) { if (!initialized) return; volume = e.NewValue; preferences = preferences with { Volume = volume }; preferencesDirty = true; if (outgoing == null) active.Volume = volume; }
    private void FavoriteClick(object sender, RoutedEventArgs e) { if (Current != null) Safe(() => Update(Current with { Favorite = !Current.Favorite })); }
    private void ShuffleClick(object sender, RoutedEventArgs e) { if (Current == null) return; var id = Current.Id; queue = new[] { Current }.Concat(queue.Where(s => s.Id != id).OrderBy(_ => Random.Shared.Next())).ToList(); index = 0; CancelFade(); PrepareNext(); Notify("Upcoming songs shuffled."); }
    private void RepeatClick(object sender, RoutedEventArgs e) { repeat = repeat == "off" ? "all" : repeat == "all" ? "one" : "off"; UpdateRepeat(); PrepareNext(); }
    /// <summary>Repeat is a state, so the button says which one it is in.</summary>
    private void UpdateRepeat()
    {
        RepeatButton.ToolTip = "Repeat: " + repeat;
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
    private void CollapseClick(object sender, RoutedEventArgs e) => ShowPage(previousPage);
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
            Notify(text.Length == 0 ? "No matching lyrics." : "Lyrics saved for offline listening.");
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
    private void WindowKey(object sender, KeyEventArgs e) { if (e.OriginalSource is TextBox) return; if (e.Key == Key.Space && Keyboard.Modifiers == ModifierKeys.None) { ToggleClick(this, e); e.Handled = true; } else if (e.Key == Key.F && Keyboard.Modifiers == ModifierKeys.Control) { ShowPage("Search"); searchBox?.Focus(); e.Handled = true; } }
    private void ClosingWindow(object? sender, System.ComponentModel.CancelEventArgs e) { SaveSession(); timer.Stop(); active.Close(); spare?.Close(); outgoing?.Close(); client.Dispose(); }
}
