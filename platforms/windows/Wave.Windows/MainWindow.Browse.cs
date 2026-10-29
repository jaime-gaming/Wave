using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
namespace Wave.Windows;

public partial class MainWindow
{
    private static string AlbumKey(Song song) => song.Artist + "\u001f" + song.Album;
    private static TextBlock Label(string text, double size = 15) => new() { Text = text, FontSize = size, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4, 6, 4, 6) };
    private Button ActionButton(string text, Action action)
    {
        var button = new Button { Content = text };
        button.Click += (_, _) => Safe(action); return button;
    }
    private void Refresh()
    {
        if (!initialized || page is "Now playing" or "Settings") return;
        CollectionHeader.Children.Clear();
        Summary.Text = $"{NativeCollections.Count(tracks.Count, "song")} · {NativeCollections.Count(tracks.Select(s => AlbumKey(s)).Distinct().Count(), "album")}";
        if (page == "Home") RenderHome();
        else if (page == "Remix") RenderRemix();
        else if (page == "Search") {
            searchBox = new TextBox { Text = searchQuery, Margin = new Thickness(0, 0, 0, 20), ToolTip = "Search songs, artists and albums", MinHeight = 48 };
            searchBox.TextChanged += (_, _) => { searchQuery = searchBox.Text; UpdateSongs(); };
            CollectionHeader.Children.Add(searchBox);
            CollectionHeader.Children.Add(Label("Search your music", 22));
        } else {
            var tabs = new WrapPanel();
            foreach (string view in new[] { "Library", "Albums", "Artists", "Playlists", "Favorites" }) tabs.Children.Add(ActionButton(view == "Library" ? "Songs" : view, () => ShowPage(view)));
            CollectionHeader.Children.Add(tabs);
            if (collection != null) CollectionHeader.Children.Add(ActionButton("← Back", () => ShowPage(page == "Daily mix" ? "Home" : page)));
            if (page is "Albums" or "Artists" && collection == null) RenderGroups(page);
            else if (page == "Playlists" && collection == null) RenderPlaylists();
            else if (collection != null) RenderCollection();
        }
        UpdateSongs();
    }
    private List<Song> SelectedSongs()
    {
        if (page == "Favorites") return tracks.Where(s => s.Favorite).ToList();
        if (page == "Albums") return collection == null ? [] : tracks.Where(s => AlbumKey(s) == collection).ToList();
        if (page == "Artists") return collection == null ? [] : tracks.Where(s => s.Artist == collection).ToList();
        if (page == "Playlists") return NativeCollections.Resolve(playlists.Find(p => p.Id == collection)?.TrackIds ?? [], tracks);
        if (page == "Daily mix") return DailyGroups().FirstOrDefault(g => g.Id == collection)?.Songs ?? [];
        if (page == "Remix") return ListeningNow().Recent;
        if (page == "Search") {
            var words = LyricsClient.Canonical(searchQuery).Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return tracks.Where(s => words.All(word => LyricsClient.Canonical(s.Title + " " + s.Artist + " " + s.Album).Contains(word))).ToList();
        }
        return page == "Home" ? tracks.TakeLast(6).Reverse().ToList() : tracks;
    }
    private void UpdateSongs()
    {
        visible = SelectedSongs(); Songs.ItemsSource = visible;
        Songs.Visibility = visible.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        var old = CollectionHeader.Children.OfType<TextBlock>().FirstOrDefault(t => Equals(t.Tag, "empty"));
        if (old != null) CollectionHeader.Children.Remove(old);
        if (visible.Count == 0 && !(page is "Albums" or "Artists" or "Playlists" && collection == null)) {
            var empty = Label(tracks.Count == 0 ? "Your music belongs here. Add audio files from your device to get started." : "No songs in this selection yet.", 21);
            empty.Tag = "empty"; CollectionHeader.Children.Add(empty);
        }
    }
    private void RenderHome()
    {
        CollectionHeader.Children.Add(Label("Your collection", 24));
        var shortcuts = new WrapPanel();
        foreach (var item in new[] { ("Library", "Songs", tracks.Count), ("Albums", "Albums", tracks.Select(AlbumKey).Distinct().Count()), ("Artists", "Artists", tracks.Select(s => s.Artist).Distinct().Count()), ("Playlists", "Playlists", playlists.Count), ("Favorites", "Favorites", tracks.Count(s => s.Favorite)) }) {
            var content = new StackPanel(); content.Children.Add(Label(item.Item3.ToString(), 26)); content.Children.Add(Label(item.Item2, 14));
            var button = ActionButton(item.Item2, () => ShowPage(item.Item1)); button.Content = content; button.Width = 128; button.HorizontalContentAlignment = HorizontalAlignment.Left;
            shortcuts.Children.Add(button);
        }
        CollectionHeader.Children.Add(shortcuts);
        var daily = DailyGroups();
        if (daily.Count > 0) {
            CollectionHeader.Children.Add(Label("Daily mixes", 22)); var mixes = new WrapPanel();
            for (int i = 0; i < daily.Count; i++) { var mix = daily[i]; mixes.Children.Add(Card($"Daily mix {i + 1}", mix.Label, mix.Songs.FirstOrDefault()?.Artwork, () => ShowPage("Daily mix", mix.Id))); }
            CollectionHeader.Children.Add(mixes);
        }
        var summary = ListeningNow();
        if (summary.Recent.Count > 0) {
            CollectionHeader.Children.Add(Label("Jump back in", 22)); var back = new WrapPanel();
            foreach (var song in summary.Recent.Take(6)) back.Children.Add(Card(song.Title, song.Artist, song.Artwork, () => PlayCollection(summary.Recent, song.Id)));
            CollectionHeader.Children.Add(back);
        }
        CollectionHeader.Children.Add(Label("Recently added albums", 22));
        var shelf = new StackPanel { Orientation = Orientation.Horizontal };
        foreach (var album in tracks.GroupBy(AlbumKey).Reverse().Take(6)) {
            var song = album.First(); shelf.Children.Add(Card(song.Album, song.Artist, song.Artwork, () => ShowPage("Albums", album.Key)));
        }
        CollectionHeader.Children.Add(new ScrollViewer { Content = shelf, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled });
        CollectionHeader.Children.Add(Label("Recently added songs", 22));
    }
    private Button Card(string title, string subtitle, string? artwork, Action action)
    {
        var body = new StackPanel { Width = 140 };
        var art = new Border { Width = 140, Height = 116, CornerRadius = new CornerRadius(20), Background = ArtworkBrush(artwork) };
        if (artwork == null) art.Child = new TextBlock { Text = "♪", FontSize = 42, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        body.Children.Add(art);
        body.Children.Add(new TextBlock { Text = title, FontSize = 16, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 10, 0, 4), ToolTip = title });
        body.Children.Add(new TextBlock { Text = subtitle, FontSize = 13, TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = subtitle });
        var card = ActionButton(title, action); card.Content = body; card.Padding = new Thickness(10); card.Background = Brushes.Transparent; return card;
    }
    private void RenderGroups(string kind)
    {
        var cards = new WrapPanel();
        foreach (var group in tracks.GroupBy(s => kind == "Albums" ? AlbumKey(s) : s.Artist)) {
            var first = group.First(); string key = group.Key;
            cards.Children.Add(Card(kind == "Albums" ? first.Album : first.Artist, NativeCollections.Count(group.Count(), "song"), first.Artwork, () => ShowPage(kind, key)));
        }
        CollectionHeader.Children.Add(cards);
    }
    private void RenderPlaylists()
    {
        CollectionHeader.Children.Add(ActionButton("+ Create playlist", () => EditPlaylist(null)));
        var cards = new WrapPanel();
        foreach (var playlist in playlists) cards.Children.Add(Card(playlist.Name, NativeCollections.Count(playlist.TrackIds.Count, "song"), NativeCollections.Resolve(playlist.TrackIds, tracks).FirstOrDefault()?.Artwork, () => ShowPage("Playlists", playlist.Id)));
        CollectionHeader.Children.Add(cards);
    }
    private void RenderCollection()
    {
        var songs = SelectedSongs(); var playlist = playlists.Find(p => p.Id == collection);
        string title = page == "Albums" ? songs.FirstOrDefault()?.Album ?? "Album" : playlist?.Name ?? collection ?? page;
        if (page == "Daily mix") title = DailyGroups().Find(g => g.Id == collection)?.Label ?? "Daily mix";
        Heading.Text = title;
        CollectionHeader.Children.Add(Label(title, 30));
        CollectionHeader.Children.Add(Label($"{NativeCollections.Count(songs.Count, "song")} · {Clock(songs.Sum(s => s.Duration))}", 14));
        if (!string.IsNullOrWhiteSpace(playlist?.Description)) CollectionHeader.Children.Add(Label(playlist.Description));
        var actions = new WrapPanel();
        actions.Children.Add(ActionButton("▶ Play", () => { if (songs.Count > 0) PlayCollection(songs, songs[0].Id); }));
        actions.Children.Add(ActionButton("Shuffle", () => { var shuffled = songs.OrderBy(_ => Random.Shared.Next()).ToList(); if (shuffled.Count > 0) PlayCollection(shuffled, shuffled[0].Id); }));
        if (page == "Daily mix") actions.Children.Add(ActionButton("Save as playlist", () => { var saved = new NativePlaylist(Guid.NewGuid().ToString(), $"Daily mix · {title}", "Saved from your local daily selection.", songs.Select(s => s.Id).ToList()); SavePlaylists(playlists.Append(saved).ToList()); ShowPage("Playlists", saved.Id); }));
        if (playlist != null) {
            actions.Children.Add(ActionButton("Add songs", () => PickPlaylistSongs(playlist)));
            actions.Children.Add(ActionButton("Edit playlist", () => EditPlaylist(playlist)));
            actions.Children.Add(ActionButton("Delete playlist", () => { if (MessageBox.Show(this, "Delete this playlist? Your songs will remain in your library.", "Wave", MessageBoxButton.YesNo) == MessageBoxResult.Yes) Safe(() => { SavePlaylists(playlists.Where(p => p.Id != playlist.Id).ToList()); ShowPage("Playlists"); }); }));
        }
        CollectionHeader.Children.Add(actions);
    }
    /// <summary>
    /// The week as one card, then the list it earns: Play Remix, or save it as an
    /// ordinary playlist. The detail of the old page — a fortnight of bars, a
    /// recent list — is deliberately gone; a recap is glanced at.
    /// </summary>
    private void RenderRemix()
    {
        var recap = Listening.Recap(plays, tracks, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        CollectionHeader.Children.Add(Label(Listening.WeekRange(recap.Start, recap.End), 13));
        if (plays.Count == 0) {
            CollectionHeader.Children.Add(Label("No week to look back on yet. Play a song and this page fills in: your week in one number, and a list of what you actually played.", 19));
            return;
        }
        CollectionHeader.Children.Add(Label("This week", 12));
        CollectionHeader.Children.Add(Label(Listening.Time(recap.Seconds), 44));
        CollectionHeader.Children.Add(Label($"{NativeCollections.Count(recap.Plays, "play")} \u00b7 {NativeCollections.Count(recap.Tracks, "song")} \u00b7 {NativeCollections.Count(recap.Artists, "artist")}", 13));
        if (recap.PreviousSeconds > 0) {
            int delta = recap.Seconds - recap.PreviousSeconds;
            CollectionHeader.Children.Add(Label($"{(delta >= 0 ? "+" : "\u2212")}{Listening.Time(Math.Abs(delta))} vs last week", 12));
        }
        if (recap.Genres.Count > 0)
            CollectionHeader.Children.Add(Label($"Mostly {recap.Genres[0].Genre}", 13));
        if (recap.Days.Count > 0) CollectionHeader.Children.Add(WeekChart(recap.Days));
        if (recap.Hours.Any(hour => hour > 0)) CollectionHeader.Children.Add(HourChart(recap.Hours));
        if (recap.Songs.Count > 0) {
            CollectionHeader.Children.Add(Label("Your Remix", 22));
            CollectionHeader.Children.Add(Label($"{NativeCollections.Count(recap.Songs.Count, "song")} you played most, in order.", 13));
            var actions = new WrapPanel();
            actions.Children.Add(ActionButton("\u25b6 Play Remix", () => PlayCollection(recap.Songs, recap.Songs[0].Id)));
            actions.Children.Add(ActionButton("Save as playlist", () => {
                var saved = new NativePlaylist(Guid.NewGuid().ToString(),
                    $"Remix \u00b7 {DateTimeOffset.FromUnixTimeMilliseconds(recap.End).LocalDateTime:d MMM}",
                    "Saved from Remix, the songs you played most this week.", recap.Songs.Select(s => s.Id).ToList());
                SavePlaylists(playlists.Append(saved).ToList());
                ShowPage("Playlists", saved.Id);
            }));
            CollectionHeader.Children.Add(actions);
            foreach (var song in recap.Songs) {
                var count = recap.TopSongs.FirstOrDefault(entry => entry.Song.Id == song.Id).Count;
                CollectionHeader.Children.Add(CountRow(song.Title + " \u2014 " + song.Artist, count, () => PlayCollection(recap.Songs, song.Id)));
            }
        }
        if (recap.TopArtists.Count > 0) {
            CollectionHeader.Children.Add(Label("Artists this week", 22));
            foreach (var (artist, count) in recap.TopArtists)
                CollectionHeader.Children.Add(CountRow(artist, count, () => ShowPage("Artists", artist)));
        }
        CollectionHeader.Children.Add(ActionButton("Clear history", () => {
            if (MessageBox.Show(this, "Clear the listening history? The songs stay in your library.", "Wave", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
            Listening.Clear(repository.Folder);
            plays = [];
            Refresh();
        }));
    }
    /// <summary>
    /// The week as seven bars, the same chart the web page draws: one column
    /// per day, height in proportion to the day's minutes, quiet days keeping a
    /// stub so the week never changes width.
    /// </summary>
    private UIElement WeekChart(List<DaySlice> days)
    {
        int peak = Math.Max(1, days.Max(day => day.Seconds));
        var bars = new UniformGrid { Columns = days.Count, Height = 96, Margin = new Thickness(4, 8, 4, 0) };
        var labels = new UniformGrid { Columns = days.Count, Margin = new Thickness(4, 6, 4, 6) };
        var accent = (Brush)Application.Current.Resources["AccentBrush"];
        foreach (var day in days)
        {
            double share = day.Seconds == 0 ? 0.05 : Math.Max(0.09, day.Seconds / (double)peak);
            bars.Children.Add(new Border
            {
                Width = 30,
                Height = 96 * share,
                CornerRadius = new CornerRadius(9, 9, 0, 0),
                Background = accent,
                Opacity = day.Equals(days[^1]) ? 1 : 0.55,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
            });
            labels.Children.Add(new TextBlock
            {
                Text = DateTimeOffset.FromUnixTimeMilliseconds(day.At).LocalDateTime.ToString("ddd", System.Globalization.CultureInfo.CurrentCulture).Substring(0, 1),
                FontSize = 11,
                Foreground = (Brush)Application.Current.Resources["MutedBrush"],
                HorizontalAlignment = HorizontalAlignment.Center,
            });
        }
        return new StackPanel { Children = { Label("How the week went", 22), bars, labels } };
    }

    /// <summary>When in the day: one thin column per hour, the busiest lit.</summary>
    private UIElement HourChart(List<int> hours)
    {
        int peak = Math.Max(1, hours.Max());
        int peakHour = hours.IndexOf(peak);
        var columns = new UniformGrid { Columns = hours.Count, Height = 56, Margin = new Thickness(4, 8, 4, 6) };
        var accent = (Brush)Application.Current.Resources["AccentBrush"];
        for (int hour = 0; hour < hours.Count; hour++)
        {
            double share = hours[hour] == 0 ? 0.06 : Math.Max(0.1, hours[hour] / (double)peak);
            columns.Children.Add(new Border
            {
                Width = 10,
                Height = 56 * share,
                CornerRadius = new CornerRadius(3),
                Background = accent,
                Opacity = hour == peakHour ? 1 : 0.34,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
            });
        }
        return new StackPanel
        {
            Children =
            {
                Label($"When you listen \u00b7 around {peakHour:00}:00", 22),
                columns,
            },
        };
    }

    private UIElement CountRow(string title, int count, Action action)
    {
        var row = new DockPanel { Margin = new Thickness(0, 4, 0, 4) };
        var number = Label($"{count} plays", 13);
        DockPanel.SetDock(number, Dock.Right);
        row.Children.Add(number);
        row.Children.Add(ActionButton(title, action));
        return row;
    }
    private List<NativeMix> DailyGroups() => NativeCollections.DailyMixes(tracks, DateOnly.FromDateTime(DateTime.Today));
    private void SavePlaylists(List<NativePlaylist> updated) { NativeCollections.Save(repository.Folder, "playlists.json", updated); playlists = updated; }
    private Window Dialog(string title, double height = 540) => new() { Owner = this, Title = title, Width = 520, Height = height, MinWidth = 400, MinHeight = 320, WindowStartupLocation = WindowStartupLocation.CenterOwner, Background = (Brush)Application.Current.Resources["SurfaceBrush"], Foreground = (Brush)Application.Current.Resources["InkBrush"], FontFamily = FontFamily, FontSize = FontSize };
    private void EditPlaylist(NativePlaylist? playlist)
    {
        var window = Dialog(playlist == null ? "Create playlist" : "Edit playlist", 380); var body = new StackPanel { Margin = new Thickness(24) };
        var name = new TextBox { Text = playlist?.Name ?? "", MaxLength = 100 }; var description = new TextBox { Text = playlist?.Description ?? "", MaxLength = 1000, AcceptsReturn = true, Height = 90 };
        body.Children.Add(Label("Name")); body.Children.Add(name); body.Children.Add(Label("Description")); body.Children.Add(description);
        body.Children.Add(ActionButton("Save playlist", () => Safe(() => { if (name.Text.Trim().Length == 0) return; var saved = new NativePlaylist(playlist?.Id ?? Guid.NewGuid().ToString(), name.Text.Trim(), description.Text.Trim(), playlist?.TrackIds ?? []); SavePlaylists(playlist == null ? playlists.Append(saved).ToList() : playlists.Select(p => p.Id == saved.Id ? saved : p).ToList()); window.Close(); ShowPage("Playlists", saved.Id); })));
        window.Content = body; window.ShowDialog();
    }
    private void PickPlaylistSongs(NativePlaylist playlist)
    {
        var window = Dialog("Add songs"); var root = new DockPanel { Margin = new Thickness(20) }; var list = new ListBox { SelectionMode = SelectionMode.Multiple, ItemsSource = tracks, DisplayMemberPath = "Title" };
        var save = ActionButton("Add selected songs", () => Safe(() => { var updated = playlist with { TrackIds = playlist.TrackIds.Concat(list.SelectedItems.Cast<Song>().Select(s => s.Id)).Distinct().ToList() }; SavePlaylists(playlists.Select(p => p.Id == updated.Id ? updated : p).ToList()); window.Close(); Refresh(); }));
        DockPanel.SetDock(save, Dock.Bottom); root.Children.Add(save); root.Children.Add(list); window.Content = root; window.ShowDialog();
    }
    private void Enqueue(Song song, bool next)
    {
        if (Current == null) { PlayCollection(new[] { song }, song.Id); return; }
        string current = Current.Id;
        if (song.Id == current) { Notify("This song is already playing."); return; }
        queue.RemoveAll(s => s.Id == song.Id); index = queue.FindIndex(s => s.Id == current);
        if (next) queue.Insert(index + 1, song); else queue.Add(song);
        PrepareNext(); SaveSession(); Notify(next ? "Added next in queue." : "Added to queue.");
    }
    private void SongOptionsClick(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: Song song } button) return;
        var menu = new ContextMenu();
        void Item(string text, Action action) { var item = new MenuItem { Header = text }; item.Click += (_, _) => Safe(action); menu.Items.Add(item); }
        Item("Play next", () => Enqueue(song, true));
        Item("Add to queue", () => Enqueue(song, false));
        Item(song.Favorite ? "Remove favorite" : "Add favorite", () => Update(song with { Favorite = !song.Favorite }));
        Item("Edit song / lyrics", () => EditSong(song));
        foreach (var playlist in playlists) Item("Add to " + playlist.Name, () => { var updated = playlist with { TrackIds = playlist.TrackIds.Append(song.Id).Distinct().ToList() }; SavePlaylists(playlists.Select(p => p.Id == updated.Id ? updated : p).ToList()); Refresh(); });
        if (page == "Playlists" && playlists.Find(p => p.Id == collection) is { } selected) {
            Item("Remove from playlist", () => { SavePlaylists(playlists.Select(p => p.Id == selected.Id ? p with { TrackIds = p.TrackIds.Where(id => id != song.Id).ToList() } : p).ToList()); Refresh(); });
            void Move(int direction) { var ids = selected.TrackIds.ToList(); int from = ids.IndexOf(song.Id), to = from + direction; if (from < 0 || to < 0 || to >= ids.Count) return; (ids[from], ids[to]) = (ids[to], ids[from]); SavePlaylists(playlists.Select(p => p.Id == selected.Id ? p with { TrackIds = ids } : p).ToList()); Refresh(); }
            Item("Move up in playlist", () => Move(-1)); Item("Move down in playlist", () => Move(1));
        }
        menu.PlacementTarget = button; menu.IsOpen = true;
    }
    private void QueueClick(object sender, RoutedEventArgs e)
    {
        var window = Dialog("Playback queue"); var root = new DockPanel { Margin = new Thickness(20) }; var list = new ListBox { DisplayMemberPath = "Title" };
        void Reload(int selected) { list.ItemsSource = queue.ToList(); list.SelectedIndex = Math.Clamp(selected, -1, queue.Count - 1); }
        void Move(int direction) { int from = list.SelectedIndex; var id = Current?.Id; queue = NativeCollections.Move(queue, from, from + direction); index = queue.FindIndex(s => s.Id == id); CancelFade(); PrepareNext(); Reload(from + direction); SaveSession(); }
        var actions = new WrapPanel(); actions.Children.Add(ActionButton("Move up", () => Move(-1))); actions.Children.Add(ActionButton("Move down", () => Move(1)));
        actions.Children.Add(ActionButton("Remove", () => { int selected = list.SelectedIndex; if (selected < 0) return; if (selected == index) { Notify("Select another song before removing the current one."); return; } queue.RemoveAt(selected); if (selected < index) index--; PrepareNext(); Reload(Math.Min(selected, queue.Count - 1)); SaveSession(); }));
        actions.Children.Add(ActionButton("Play selected", () => { if (list.SelectedIndex >= 0) Play(list.SelectedIndex); }));
        DockPanel.SetDock(actions, Dock.Bottom); root.Children.Add(actions); root.Children.Add(list); Reload(index); window.Content = root; window.ShowDialog();
    }
}
