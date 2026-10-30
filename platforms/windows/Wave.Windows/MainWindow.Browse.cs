using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
namespace Wave.Windows;

public partial class MainWindow
{
    private static string AlbumKey(Song song) => song.Artist + "\u001f" + song.Album;
    private static TextBlock Label(string text, double size = 15) => new() { Text = text, FontSize = size, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(2, 6, 2, 6) };
    private Button ActionButton(string text, Action action)
    {
        var button = new Button { Content = text };
        button.Click += (_, _) => Safe(action); return button;
    }
    private void Refresh()
    {
        if (!initialized || page is "Now playing" or "Settings") return;
        CollectionHeader.Children.Clear();
        UpdateSummary();
        UpdateRailCounts();
        if (page == "Home") RenderHome();
        else if (page == "Remix") RenderRemix();
        else if (page == "Search") {
            searchBox = new TextBox { Text = searchQuery, Margin = new Thickness(0, 0, 0, 20), ToolTip = "Search songs, artists and albums", MinHeight = 48 };
            searchBox.TextChanged += (_, _) => { searchQuery = searchBox.Text; UpdateSongs(); };
            CollectionHeader.Children.Add(searchBox);
            CollectionHeader.Children.Add(Label("Search your music", 22));
        } else {
            var tabs = new WrapPanel { Margin = new Thickness(0, 4, 0, 8) };
            foreach (string view in new[] { "Library", "Albums", "Artists", "Playlists", "Favorites" })
                tabs.Children.Add(Pill(view == "Library" ? "Songs" : view, page == view, () => ShowPage(view)));
            CollectionHeader.Children.Add(tabs);
            if (collection != null) CollectionHeader.Children.Add(BackLink(page == "Daily mix" ? "Home" : page));
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
        Songs.Visibility = !WholePage && visible.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        var old = CollectionHeader.Children.OfType<TextBlock>().FirstOrDefault(t => Equals(t.Tag, "empty"));
        if (old != null) CollectionHeader.Children.Remove(old);
        if (visible.Count == 0 && !(page is "Albums" or "Artists" or "Playlists" && collection == null)) {
            var empty = Label(tracks.Count == 0 ? "Your music belongs here. Add audio files from your device to get started." : "No songs in this selection yet.", 21);
            empty.Tag = "empty"; CollectionHeader.Children.Add(empty);
        }
    }
    /// <summary>
    /// Home, laid out the way the browser lays it out: one band of numbers, then
    /// the songs and mixes the week has to offer, then what came in last. The page
    /// scrolls as one thing, so there is never a second scrollbar beside the first.
    /// </summary>
    private void RenderHome()
    {
        CollectionHeader.Children.Add(SectionHeading("Your collection", AddMusicButton()));

        var shortcuts = new UniformGrid { Columns = 5, Margin = new Thickness(0, 0, 0, 4) };
        var collection = new[] {
            ("Library", "Songs", tracks.Count, "library"),
            ("Albums", "Albums", tracks.Select(AlbumKey).Distinct().Count(), "disc"),
            ("Artists", "Artists", tracks.Select(s => s.Artist).Distinct().Count(), "artist"),
            ("Playlists", "Playlists", playlists.Count, "queue"),
            ("Favorites", "Favorites", tracks.Count(s => s.Favorite), "heart"),
        };
        for (int i = 0; i < collection.Length; i++) {
            var (destination, label, count, icon) = collection[i];
            shortcuts.Children.Add(Shortcut(icon, count, label, destination, i == 0));
        }
        CollectionHeader.Children.Add(shortcuts);

        var daily = DailyGroups();
        if (daily.Count > 0) {
            CollectionHeader.Children.Add(SectionHeading("Daily mixes"));
            for (int i = 0; i < daily.Count; i++) {
                var mix = daily[i];
                CollectionHeader.Children.Add(MixRow($"Daily mix {i + 1}", mix.Label, mix.Songs.FirstOrDefault()?.Artwork, () => ShowPage("Daily mix", mix.Id)));
            }
        }

        CollectionHeader.Children.Add(SectionHeading("Recently added albums"));
        var shelf = new StackPanel { Orientation = Orientation.Horizontal };
        foreach (var album in tracks.GroupBy(AlbumKey).Reverse().Take(6)) {
            var song = album.First(); shelf.Children.Add(Card(song.Album, song.Artist, song.Artwork, () => ShowPage("Albums", album.Key)));
        }
        CollectionHeader.Children.Add(new ScrollViewer { Content = shelf, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, Margin = new Thickness(0, 0, 0, 2) });

        var recent = tracks.TakeLast(6).Reverse().ToList();
        if (recent.Count > 0) {
            CollectionHeader.Children.Add(SectionHeading("Recently added songs"));
            foreach (var song in recent) CollectionHeader.Children.Add(SongRow(song, () => PlayCollection(recent, song.Id)));
        }
    }
    /// <summary>A view tab: quiet until it is the view you are looking at.</summary>
    private Button Pill(string text, bool active, Action action)
    {
        var button = new Button {
            Content = text,
            Padding = new Thickness(18, 8, 18, 8),
            Margin = new Thickness(4),
            MinHeight = 38,
            Background = (Brush)Application.Current.Resources[active ? "AccentTonalBrush" : "TonalBrush"],
            Foreground = (Brush)Application.Current.Resources[active ? "AccentBrush" : "InkBrush"],
            FontWeight = active ? FontWeights.Bold : FontWeights.SemiBold,
        };
        button.Click += (_, _) => Safe(action);
        return button;
    }
    /// <summary>A way back that reads as a line of text, not as a button in the row.</summary>
    private Button BackLink(string destination)
    {
        var button = new Button { Style = (Style)FindResource("TextButton"), Foreground = (Brush)Application.Current.Resources["MutedBrush"], Margin = new Thickness(4, 2, 4, 10), Padding = new Thickness(2, 4, 6, 4) };
        button.Content = Iconography.With("chevron-left", "Back", 15, 6);
        button.Click += (_, _) => Safe(() => ShowPage(destination));
        return button;
    }
    /// <summary>A section heading with, optionally, the one action that belongs to it.</summary>
    private FrameworkElement SectionHeading(string text, UIElement? trailing = null)
    {
        var row = new DockPanel { Margin = new Thickness(2, 18, 2, 10) };
        if (trailing != null) { DockPanel.SetDock(trailing, Dock.Right); row.Children.Add(trailing); }
        row.Children.Add(new TextBlock { Text = text, FontSize = 19, FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center });
        return row;
    }
    private Button AddMusicButton()
    {
        var button = new Button { Style = (Style)FindResource("AccentButton"), Padding = new Thickness(16, 9, 18, 9), ToolTip = "Add music" };
        button.Content = Iconography.With("plus", "Add music", 17, 8);
        button.Click += ImportClick;
        return button;
    }
    private Button TextAction(string text, string icon, Action action)
    {
        var button = new Button { Style = (Style)FindResource("TextButton"), Foreground = (Brush)Application.Current.Resources["AccentBrush"], FontWeight = FontWeights.SemiBold, FontSize = 13, VerticalAlignment = VerticalAlignment.Center, Padding = new Thickness(6, 4, 2, 4) };
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
        var glyph = Iconography.Draw(icon, 15);
        glyph.Margin = new Thickness(5, 0, 0, 0);
        row.Children.Add(glyph);
        button.Content = row;
        button.Click += (_, _) => Safe(action);
        return button;
    }
    /// <summary>One collection number: a small icon, the count, and what it counts.</summary>
    private Button Shortcut(string icon, int count, string label, string destination, bool first)
    {
        var body = new Grid();
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        body.Children.Add(Iconography.Draw(icon, 18, 1.7, (Brush)Application.Current.Resources["AccentBrush"]));
        var number = new TextBlock { Text = count.ToString(), FontSize = 24, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -6, 0, 0) };
        Grid.SetColumn(number, 1); body.Children.Add(number);
        var name = new TextBlock { Text = label, FontSize = 13, Foreground = (Brush)Application.Current.Resources["MutedBrush"], Margin = new Thickness(-6, 14, 0, 0) };
        Grid.SetRow(name, 1); Grid.SetColumn(name, 0); Grid.SetColumnSpan(name, 2); body.Children.Add(name);
        var button = new Button {
            Content = body,
            Padding = new Thickness(14, 12, 14, 12),
            Margin = new Thickness(4),
            MinHeight = 92,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Background = (Brush)Application.Current.Resources[first ? "AccentTonalBrush" : "TonalBrush"],
        };
        button.Click += (_, _) => Safe(() => ShowPage(destination));
        return button;
    }
    /// <summary>A daily mix as a row: what it is, what it sounds like, and a way in.</summary>
    private Button MixRow(string title, string genre, string? artwork, Action action)
    {
        var row = new Grid { Margin = new Thickness(4, 2, 4, 2) };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var art = new Border { Width = 48, Height = 48, CornerRadius = new CornerRadius(14), Background = ArtworkBrush(artwork) };
        if (artwork == null) art.Child = new TextBlock { Text = "♪", FontSize = 20, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = (Brush)Application.Current.Resources["AccentBrush"] };
        row.Children.Add(art);
        var words = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(14, 0, 0, 0) };
        words.Children.Add(new TextBlock { Text = title, FontWeight = FontWeights.SemiBold, FontSize = 15 });
        words.Children.Add(new TextBlock { Text = genre, FontSize = 13, Foreground = (Brush)Application.Current.Resources["MutedBrush"] });
        Grid.SetColumn(words, 1); row.Children.Add(words);
        var arrow = Iconography.Draw("arrow-up-right", 18, 1.7, (Brush)Application.Current.Resources["MutedBrush"]);
        Grid.SetColumn(arrow, 2); row.Children.Add(arrow);
        var button = new Button {
            Content = row,
            Background = (Brush)Application.Current.Resources["TonalBrush"],
            Padding = new Thickness(10),
            Margin = new Thickness(4, 2, 4, 2),
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            ToolTip = title,
        };
        button.Click += (_, _) => Safe(action);
        return button;
    }
    /// <summary>
    /// A song as a row you can play. The rank and the play count are optional: the
    /// Remix list numbers its rows and says how often each was heard, the library
    /// list leaves both out.
    /// </summary>
    private Button SongRow(Song song, Action action, int rank = 0, int plays = 0)
    {
        var row = new Grid();
        if (rank > 0) row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(30) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        if (plays > 0) row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        int column = 0;
        if (rank > 0) {
            var number = new TextBlock { Text = rank.ToString(), FontSize = 12.5, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 0, 12, 0) };
            number.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
            row.Children.Add(number);
            column = 1;
        }
        var art = new Border { Width = 44, Height = 44, CornerRadius = new CornerRadius(12), Background = ArtworkBrush(song.Artwork) };
        if (song.Artwork == null) art.Child = new TextBlock { Text = "\u266a", FontSize = 19, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = (Brush)Application.Current.Resources["AccentBrush"] };
        Grid.SetColumn(art, column); row.Children.Add(art);
        var words = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 12, 0) };
        words.Children.Add(new TextBlock { Text = song.Title, FontWeight = FontWeights.SemiBold, FontSize = 15, TextTrimming = TextTrimming.CharacterEllipsis });
        words.Children.Add(new TextBlock { Text = song.Artist, FontSize = 13, Foreground = (Brush)Application.Current.Resources["MutedBrush"], TextTrimming = TextTrimming.CharacterEllipsis });
        Grid.SetColumn(words, column + 1); row.Children.Add(words);
        var album = new TextBlock { Text = song.Album, FontSize = 12.5, Foreground = (Brush)Application.Current.Resources["MutedBrush"], VerticalAlignment = VerticalAlignment.Center, MaxWidth = 200, TextTrimming = TextTrimming.CharacterEllipsis };
        Grid.SetColumn(album, column + 2); row.Children.Add(album);
        if (plays > 0) {
            var times = new TextBlock { Text = plays + "\u00d7", FontSize = 12.5, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(14, 0, 4, 0) };
            times.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
            Grid.SetColumn(times, column + 3); row.Children.Add(times);
        }
        var button = new Button {
            Content = row,
            Background = Brushes.Transparent,
            Padding = new Thickness(8, 6, 8, 6),
            Margin = new Thickness(2, 1, 2, 1),
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            ToolTip = song.Title,
        };
        button.Click += (_, _) => Safe(action);
        return button;
    }
    /// <summary>A shelf card: square artwork, its name, whose it is.</summary>
    private Button Card(string title, string subtitle, string? artwork, Action action)
    {
        var body = new StackPanel { Width = 140 };
        // A hairline around the sleeve: on a dark page a solid cover needs an edge,
        // and on a light one it needs the same edge the other way round.
        var art = new Border {
            Width = 140, Height = 140, CornerRadius = new CornerRadius(18),
            Background = ArtworkBrush(artwork),
            BorderThickness = new Thickness(1),
            BorderBrush = (Brush)Application.Current.Resources["TonalBrush"],
        };
        if (artwork == null) art.Child = new TextBlock { Text = "♪", FontSize = 40, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = (Brush)Application.Current.Resources["AccentBrush"] };
        body.Children.Add(art);
        body.Children.Add(new TextBlock { Text = title, FontSize = 15, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(1, 9, 1, 2), ToolTip = title });
        body.Children.Add(new TextBlock { Text = subtitle, FontSize = 12.5, Foreground = (Brush)Application.Current.Resources["MutedBrush"], TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(1, 0, 1, 0), ToolTip = subtitle });
        var card = ActionButton(title, action); card.Content = body; card.Padding = new Thickness(4); card.Margin = new Thickness(6, 4, 6, 8);
        card.Background = Brushes.Transparent; card.HorizontalContentAlignment = HorizontalAlignment.Left; return card;
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
        // The banner already says the name; repeating it here would be the same
        // word twice in one screen, so the card starts with what the list is.
        var counts = Label($"{NativeCollections.Count(songs.Count, "song")} · {Clock(songs.Sum(s => s.Duration))}", 14);
        counts.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
        CollectionHeader.Children.Add(counts);
        if (!string.IsNullOrWhiteSpace(playlist?.Description)) CollectionHeader.Children.Add(Label(playlist.Description));
        var actions = new WrapPanel { Margin = new Thickness(0, 2, 0, 10) };
        var play = new Button { Style = (Style)FindResource("AccentButton"), Padding = new Thickness(18, 9, 22, 9), ToolTip = "Play" };
        play.Content = Iconography.With("play", "Play", 16, 8);
        play.Click += (_, _) => Safe(() => { if (songs.Count > 0) PlayCollection(songs, songs[0].Id); });
        actions.Children.Add(play);
        var shuffle = new Button { Padding = new Thickness(16, 9, 20, 9), ToolTip = "Shuffle" };
        shuffle.Content = Iconography.With("shuffle", "Shuffle", 16, 8);
        shuffle.Click += (_, _) => Safe(() => { var shuffled = songs.OrderBy(_ => Random.Shared.Next()).ToList(); if (shuffled.Count > 0) PlayCollection(shuffled, shuffled[0].Id); });
        actions.Children.Add(shuffle);
        if (page == "Daily mix") actions.Children.Add(ActionButton("Save as playlist", () => { var saved = new NativePlaylist(Guid.NewGuid().ToString(), $"Daily mix · {title}", "Saved from your local daily selection.", songs.Select(s => s.Id).ToList()); SavePlaylists(playlists.Append(saved).ToList()); ShowPage("Playlists", saved.Id); }));
        if (playlist != null) {
            actions.Children.Add(ActionButton("Add songs", () => PickPlaylistSongs(playlist)));
            actions.Children.Add(ActionButton("Edit playlist", () => EditPlaylist(playlist)));
            // (Delete stays at the end of the row, apart from the actions that build.)
            actions.Children.Add(ActionButton("Delete playlist", () => { if (MessageBox.Show(this, "Delete this playlist? Your songs will remain in your library.", "Wave", MessageBoxButton.YesNo) == MessageBoxResult.Yes) Safe(() => { SavePlaylists(playlists.Where(p => p.Id != playlist.Id).ToList()); ShowPage("Playlists"); }); }));
        }
        CollectionHeader.Children.Add(actions);
    }
    /// <summary>
    /// The week on one page, in the order the browser puts it: the figure with the
    /// sleeve of the song that earned it, the week as seven bars, three facts as a
    /// line of type, then the list it earns. No cards, nothing to read twice.
    /// </summary>
    private void RenderRemix()
    {
        var recap = Listening.Recap(plays, tracks, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        var head = new Grid { Margin = new Thickness(2, 4, 2, 10) };
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        head.Children.Add(Label(Listening.WeekRange(recap.Start, recap.End), 13));
        var clear = ActionButton("Clear history", () => {
            if (MessageBox.Show(this, "Clear the listening history? The songs stay in your library.", "Wave", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
            Listening.Clear(repository.Folder);
            plays = [];
            Refresh();
        });
        clear.Style = (Style)FindResource("TextButton");
        clear.Foreground = (Brush)Application.Current.Resources["MutedBrush"];
        clear.HorizontalAlignment = HorizontalAlignment.Right;
        clear.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(clear, 1);
        head.Children.Add(clear);
        CollectionHeader.Children.Add(head);

        if (plays.Count == 0) {
            CollectionHeader.Children.Add(Label("No week to look back on yet. Play a song and this page fills in: your week in one number, and a list of what you actually played.", 19));
            return;
        }

        // The figure and the sleeve, side by side, as on the web page.
        var lede = new Grid { Margin = new Thickness(2, 2, 2, 6) };
        lede.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        lede.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var copy = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom };
        var figure = Label(Listening.Time(recap.Seconds), 44);
        figure.Foreground = (Brush)Application.Current.Resources["AccentBrush"];
        figure.Margin = new Thickness(2, 0, 2, 2);
        copy.Children.Add(figure);
        copy.Children.Add(Label($"{NativeCollections.Count(recap.Plays, "play")} \u00b7 {NativeCollections.Count(recap.Tracks, "song")} \u00b7 {NativeCollections.Count(recap.Artists, "artist")}", 13));
        if (recap.PreviousSeconds > 0) {
            int delta = recap.Seconds - recap.PreviousSeconds;
            var compare = Label($"{(delta >= 0 ? "+" : "\u2212")}{Listening.Time(Math.Abs(delta))} vs last week", 12);
            if (delta >= 0) compare.Foreground = (Brush)Application.Current.Resources["AccentBrush"];
            copy.Children.Add(compare);
        }
        lede.Children.Add(copy);
        var top = recap.TopSongs.FirstOrDefault();
        var sleeve = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(20, 0, 2, 2) };
        var cover = new Border { Width = 116, Height = 116, CornerRadius = new CornerRadius(18), Background = ArtworkBrush(top.Song?.Artwork) };
        if (top.Song?.Artwork == null) cover.Child = new TextBlock { Text = "\u266a", FontSize = 38, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = (Brush)Application.Current.Resources["AccentBrush"] };
        sleeve.Children.Add(cover);
        var caption = Label("MOST PLAYED", 11);
        caption.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
        caption.HorizontalAlignment = HorizontalAlignment.Right;
        caption.Margin = new Thickness(2, 7, 2, 0);
        sleeve.Children.Add(caption);
        Grid.SetColumn(sleeve, 1);
        lede.Children.Add(sleeve);
        CollectionHeader.Children.Add(lede);

        if (recap.Days.Count > 0) CollectionHeader.Children.Add(WeekChart(recap.Days));

        // Genre, the hour and the artist that carried the week: one line.
        var note = new WrapPanel { Margin = new Thickness(2, 2, 2, 12) };
        void Fact(string text) {
            var block = Label(text, 13);
            block.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
            note.Children.Add(block);
        }
        if (recap.Genres.Count > 0) Fact($"Mostly {recap.Genres[0].Genre.ToLowerInvariant()}  \u00b7");
        if (recap.Hours.Any(hour => hour > 0)) Fact($"Usually around {recap.Hours.IndexOf(recap.Hours.Max()):00}:00  \u00b7");
        if (recap.TopArtists.Count > 0) {
            var artist = ActionButton($"{recap.TopArtists[0].Artist} most of all", () => ShowPage("Artists", recap.TopArtists[0].Artist));
            artist.Style = (Style)FindResource("TextButton");
            note.Children.Add(artist);
        }
        CollectionHeader.Children.Add(note);

        if (recap.Songs.Count > 0) {
            var mixHead = new Grid { Margin = new Thickness(2, 10, 2, 4) };
            mixHead.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            mixHead.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var words = new StackPanel();
            words.Children.Add(Label("Your Remix", 21));
            var sub = Label($"{NativeCollections.Count(recap.Songs.Count, "song")} you played this week.", 13);
            sub.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
            words.Children.Add(sub);
            mixHead.Children.Add(words);
            var actions = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom };
            var play = new Button { Style = (Style)FindResource("AccentButton"), Padding = new Thickness(18, 9, 22, 9), ToolTip = "Play Remix" };
            play.Content = Iconography.With("play", "Play Remix", 16, 8);
            play.Click += (_, _) => Safe(() => PlayCollection(recap.Songs, recap.Songs[0].Id));
            actions.Children.Add(play);
            actions.Children.Add(ActionButton("Save as playlist", () => {
                var saved = new NativePlaylist(Guid.NewGuid().ToString(),
                    $"Remix \u00b7 {DateTimeOffset.FromUnixTimeMilliseconds(recap.End).LocalDateTime:d MMM}",
                    "Saved from Remix, the songs you played most this week.", recap.Songs.Select(s => s.Id).ToList());
                SavePlaylists(playlists.Append(saved).ToList());
                ShowPage("Playlists", saved.Id);
            }));
            Grid.SetColumn(actions, 1);
            mixHead.Children.Add(actions);
            CollectionHeader.Children.Add(mixHead);
            int rank = 0;
            foreach (var song in recap.Songs) {
                rank++;
                var count = recap.TopSongs.FirstOrDefault(entry => entry.Song.Id == song.Id).Count;
                CollectionHeader.Children.Add(SongRow(song, () => PlayCollection(recap.Songs, song.Id), rank, count));
            }
        }

        if (recap.TopArtists.Count > 0) {
            // Quiet chips rather than a leaderboard, as on the web page.
            var people = new WrapPanel { Margin = new Thickness(2, 14, 2, 8) };
            foreach (var (artist, count) in recap.TopArtists.Take(6)) {
                var chip = new Button {
                    Padding = new Thickness(14, 8, 14, 8),
                    Margin = new Thickness(0, 0, 6, 6),
                    MinHeight = 36,
                    Background = (Brush)Application.Current.Resources["TonalBrush"],
                    ToolTip = artist,
                };
                var label = new StackPanel { Orientation = Orientation.Horizontal };
                label.Children.Add(new TextBlock { Text = artist, FontWeight = FontWeights.SemiBold, FontSize = 13.5 });
                label.Children.Add(new TextBlock { Text = NativeCollections.Count(count, "play"), FontSize = 12, Margin = new Thickness(8, 0, 0, 0), Foreground = (Brush)Application.Current.Resources["MutedBrush"] });
                chip.Content = label;
                chip.Click += (_, _) => Safe(() => ShowPage("Artists", artist));
                people.Children.Add(chip);
            }
            CollectionHeader.Children.Add(people);
        }

        var all = Listening.Summarise(plays, tracks, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        var foot = Label($"{Listening.Time(all.TotalSeconds)} listened all time \u00b7 {NativeCollections.Count(all.WeekPlays, "play")} this week \u00b7 counted on this device, never uploaded.", 12.5);
        foot.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
        foot.Margin = new Thickness(2, 8, 2, 4);
        CollectionHeader.Children.Add(foot);
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
        var quiet = (Brush)Application.Current.Resources["TonalBrush"];
        foreach (var day in days)
        {
            double share = day.Seconds == 0 ? 0.05 : Math.Max(0.09, day.Seconds / (double)peak);
            bars.Children.Add(new Border
            {
                Width = 30,
                Height = 96 * share,
                CornerRadius = new CornerRadius(9, 9, 0, 0),
                // Today is the one coloured bar; the rest are the page's quiet
                // surface, as on the web page.
                Background = day.Equals(days[^1]) ? accent : quiet,
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
        // The quiet line under the bars names the day that carried the week, the
        // way the browser does, instead of titling a chart.
        var busiest = days.OrderByDescending(day => day.Seconds).First();
        var caption = Label(busiest.Seconds > 0
            ? $"Most on {DateTimeOffset.FromUnixTimeMilliseconds(busiest.At).LocalDateTime:dddd}, {Listening.Time(busiest.Seconds)}"
            : "Quiet week", 12.5);
        caption.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
        caption.Margin = new Thickness(4, 2, 4, 0);
        return new StackPanel { Margin = new Thickness(0, 6, 0, 0), Children = { bars, labels, caption } };
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
