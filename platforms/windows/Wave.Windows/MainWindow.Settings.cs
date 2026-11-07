using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
namespace Wave.Windows;

public partial class MainWindow
{
    private void ApplyTheme()
    {
        App.ApplyBrushes(preferences.Theme == "light");
        // A DynamicResource on the window is resolved once and does not follow a
        // dictionary that had to be rebuilt, which left a light window with a dark
        // band behind the rail. Reading the palette here is immediate and exact.
        Background = (Brush)Application.Current.Resources["BackgroundBrush"];
        Foreground = (Brush)Application.Current.Resources["InkBrush"];
        // The rail sits on the window's own colour, so the root panel takes it too
        // rather than waiting on a resource that may still hold the old palette.
        if (Content is Panel root) root.Background = Background;
        FontSize = preferences.LargerText ? 18 : 15;
    }
    private void RenderSettings(string? section = null)
    {
        SettingsBody.Children.Clear();
        Motion.Slide(SettingsBody, Motion.Enabled(preferences.Animations), section == null ? -1 : 1);
        if (section == null) {
            var back = new Button { Style = (Style)FindResource("TextButton"), Foreground = (Brush)Application.Current.Resources["MutedBrush"], Margin = new Thickness(2, 4, 2, 14) };
            back.Content = Iconography.With("chevron-left", Localization.T("Back"), 16, 6);
            back.Click += (_, _) => Safe(() => ShowPage(previousPage));
            SettingsBody.Children.Add(back);
            foreach (var item in new[] { ("Appearance", "Theme, larger text and motion"), ("Playback", "Mix and local Autoplay"), ("Lyrics", "Optional automatic lyric search"), ("Library", "Song information and cover editing"), ("Storage", "Your original local files"), ("About", "Version, source and privacy") }) {
                var row = new Grid { Margin = new Thickness(0) };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var words = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
                words.Children.Add(Label(Localization.T(item.Item1), 17));
                var detail = Label(Localization.T(item.Item2), 13);
                detail.SetResourceReference(TextBlock.ForegroundProperty, "MutedBrush");
                detail.Margin = new Thickness(2, 0, 2, 0);
                words.Children.Add(detail);
                row.Children.Add(words);
                var chevron = Iconography.Draw("chevron-right", 17, 1.7, (Brush)Application.Current.Resources["MutedBrush"]);
                Grid.SetColumn(chevron, 1);
                row.Children.Add(chevron);
                var button = new Button { Content = row, HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(18, 12, 16, 12), Margin = new Thickness(0, 3, 0, 3), ToolTip = Localization.T(item.Item1) };
                button.Click += (_, _) => Safe(() => RenderSettings(item.Item1));
                SettingsBody.Children.Add(button);
            }
            return;
        }
        var backToAll = new Button { Style = (Style)FindResource("TextButton"), Foreground = (Brush)Application.Current.Resources["MutedBrush"], Margin = new Thickness(2, 4, 2, 10) };
        backToAll.Content = Iconography.With("chevron-left", Localization.T("Back to settings"), 16, 6);
        backToAll.Click += (_, _) => Safe(() => RenderSettings());
        SettingsBody.Children.Add(backToAll);
        SettingsBody.Children.Add(Label(Localization.T(section), 26));
        void Toggle(string text, bool value, Action<bool> changed) {
            var check = new CheckBox { Content = text, IsChecked = value };
            check.Checked += (_, _) => { changed(true); preferencesDirty = true; SaveSession(); };
            check.Unchecked += (_, _) => { changed(false); preferencesDirty = true; SaveSession(); };
            SettingsBody.Children.Add(check);
        }
        switch (section) {
            case "Appearance":
                var themes = new WrapPanel();
                foreach (string theme in new[] { "dark", "light" }) themes.Children.Add(ActionButton(Localization.T(theme == "dark" ? "Dark" : "Light"), () => { preferences = preferences with { Theme = theme }; preferencesDirty = true; ApplyTheme(); SaveSession(); }));
                SettingsBody.Children.Add(themes);
                // Sistema · English · Español: follow Windows, or pin one language;
                // the pin is remembered in the preferences file, like every choice here.
                var languages = new WrapPanel();
                foreach (string option in new[] { "system", "en", "es" }) languages.Children.Add(ActionButton(option == "system" ? Localization.T("System") : option == "en" ? "English" : "Español", () => SetLanguage(option)));
                SettingsBody.Children.Add(languages);
                Toggle(Localization.T("Larger text"), preferences.LargerText, value => { preferences = preferences with { LargerText = value }; ApplyTheme(); });
                Toggle(Localization.T("Animations"), preferences.Animations, value => preferences = preferences with { Animations = value }); break;
            case "Playback":
                Toggle(Localization.T("Mix"), MixEnabled, value => { preferences = preferences with { Mix = value }; CancelFade(); PrepareNext(); });
                SettingsBody.Children.Add(Label(Localization.T("Automatically choose a short overlap for each pair. Original audio files and pitch stay unchanged.")));
                Toggle(Localization.T("Autoplay"), preferences.Autoplay, value => preferences = preferences with { Autoplay = value });
                SettingsBody.Children.Add(Label(Localization.T("Continue with another song from your local library when the queue ends."))); break;
            case "Lyrics":
                Toggle(Localization.T("Automatic lyrics"), preferences.OnlineLyrics, value => preferences = preferences with { OnlineLyrics = value });
                SettingsBody.Children.Add(Label(Localization.T("Optional LRCLIB lookup sends song metadata and connection IP, never audio. Saved lyrics work offline. Manual search remains available in song options without starting playback."))); break;
            case "Library":
                Toggle(Localization.T("Enable library editing"), preferences.Editor, value => preferences = preferences with { Editor = value });
                SettingsBody.Children.Add(Label(Localization.T("Edit titles, artists, albums and covers in song options. These changes never rewrite your original audio."))); break;
            case "Storage":
                SettingsBody.Children.Add(Label(Localization.T("{count} original files in {folder}. Keep your originals; deleting this folder removes this library.", new Dictionary<string, string> { ["count"] = tracks.Count.ToString(), ["folder"] = repository.Folder })));
                SettingsBody.Children.Add(ActionButton(Localization.T("Open local library folder"), () => Process.Start(new ProcessStartInfo(repository.Folder) { UseShellExecute = true }))); break;
            case "About":
                SettingsBody.Children.Add(Label("Wave 0.2.1", 23));
                SettingsBody.Children.Add(Label(Localization.T("Your music. Your collection. No account required.")));
                SettingsBody.Children.Add(ActionButton(Localization.T("Source code"), () => Process.Start(new ProcessStartInfo("https://github.com/jaime-gaming/Wave") { UseShellExecute = true })));
                SettingsBody.Children.Add(ActionButton(Localization.T("Wave on the web · link devices"), () => Process.Start(new ProcessStartInfo("https://wave.jaime-gaming.com/Settings") { UseShellExecute = true })));
                SettingsBody.Children.Add(ActionButton(Localization.T("Wave for Android · APK"), () => Process.Start(new ProcessStartInfo("https://github.com/jaime-gaming/Wave/releases/latest") { UseShellExecute = true })));
                SettingsBody.Children.Add(ActionButton(Localization.T("Privacy & rights"), () => Process.Start(new ProcessStartInfo("https://wave.jaime-gaming.com/privacy.html") { UseShellExecute = true })));
                SettingsBody.Children.Add(Label(Localization.T("Use audio and lyrics you may lawfully access. See the repository privacy information."))); break;
        }
    }
    private void EditClick(object sender, RoutedEventArgs e) { if (Current != null) EditSong(Current); }
    private void EditSong(Song song)
    {
        var window = Dialog(Localization.T("Edit song / lyrics"), 660); var root = new DockPanel { Margin = new Thickness(22) }; var fields = new StackPanel();
        var title = new TextBox { Text = song.Title, IsReadOnly = !preferences.Editor, MaxLength = 500 };
        var artist = new TextBox { Text = song.Artist, IsReadOnly = !preferences.Editor, MaxLength = 500 };
        var album = new TextBox { Text = song.Album, IsReadOnly = !preferences.Editor, MaxLength = 500 };
        var lyrics = new TextBox { Text = song.Lyrics, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 180, MaxLength = 100000, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        foreach (var pair in new[] { ("Title", title), ("Artist", artist), ("Album", album), ("Lyrics / LRC", lyrics) }) { fields.Children.Add(Label(Localization.T(pair.Item1))); fields.Children.Add(pair.Item2); }
        string? artwork = song.Artwork; string? selectedCover = null;
        if (preferences.Editor) fields.Children.Add(ActionButton(Localization.T("Choose cover"), () => { var picker = new OpenFileDialog { Filter = "Images|*.png;*.jpg;*.jpeg" }; if (picker.ShowDialog(window) == true) selectedCover = picker.FileName; }));
        var status = Label(""); fields.Children.Add(status);
        var preview = new TextBox { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Visibility = Visibility.Collapsed };
        var use = ActionButton(Localization.T("Use found lyrics"), () => { lyrics.Text = preview.Text; preview.Visibility = Visibility.Collapsed; status.Text = Localization.T("Placed in your draft. Save to keep it."); });
        use.Visibility = Visibility.Collapsed;
        var search = ActionButton(Localization.T("Search online"), () => { });
        var cancellation = new CancellationTokenSource();
        window.Closed += (_, _) => { cancellation.Cancel(); cancellation.Dispose(); };
        search.Click += async (_, _) => {
            search.IsEnabled = false; status.Text = Localization.T("Searching LRCLIB…");
            try {
                string found = await client.Find(song with { Title = title.Text, Artist = artist.Text, Album = album.Text }, cancellation.Token);
                if (cancellation.IsCancellationRequested) return;
                preview.Text = found; preview.Visibility = use.Visibility = found.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
                status.Text = Localization.T(found.Length > 0 ? "Preview the result, then use and save it." : "No matching lyrics. Your draft is unchanged.");
            } catch (OperationCanceledException) { } catch (Exception error) { if (!cancellation.IsCancellationRequested) status.Text = error.Message; }
            finally { if (!cancellation.IsCancellationRequested) search.IsEnabled = true; }
        };
        fields.Children.Add(Label(Localization.T("Search sends title/artist to LRCLIB, not audio. Results are saved only when you choose Save.")));
        fields.Children.Add(search); fields.Children.Add(preview); fields.Children.Add(use);
        var actions = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Right };
        actions.Children.Add(ActionButton(Localization.T("Cancel"), window.Close));
        actions.Children.Add(ActionButton(Localization.T("Save"), () => {
            try {
                if (title.Text.Trim().Length == 0) { status.Text = Localization.T("Add a song title."); return; }
                if (selectedCover != null) artwork = SaveCover(selectedCover);
                var latest = tracks.Find(s => s.Id == song.Id); if (latest == null) { status.Text = Localization.T("This song is no longer in your library."); return; }
                Update(latest with { Title = title.Text.Trim(), Artist = artist.Text.Trim(), Album = album.Text.Trim(), Lyrics = lyrics.Text, Artwork = artwork, CheckedAt = 0 }); window.Close();
            } catch (Exception error) { status.Text = error.Message; }
        }));
        DockPanel.SetDock(actions, Dock.Bottom); root.Children.Add(actions);
        root.Children.Add(new ScrollViewer { Content = fields, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }); window.Content = root; window.ShowDialog();
    }
    private string SaveCover(string path)
    {
        if (new FileInfo(path).Length > 10 * 1024 * 1024) throw new IOException(Localization.T("Choose a cover smaller than 10 MB."));
        var image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.DecodePixelWidth = 600; image.UriSource = new Uri(path); image.EndInit();
        if ((long)image.PixelWidth * image.PixelHeight > 4_000_000) throw new IOException(Localization.T("Choose a smaller cover."));
        string folder = Path.Combine(repository.Folder, "covers"); Directory.CreateDirectory(folder); string saved = Path.Combine(folder, Guid.NewGuid() + ".jpg");
        var encoder = new JpegBitmapEncoder { QualityLevel = 88 }; encoder.Frames.Add(BitmapFrame.Create(image)); using var stream = File.Create(saved); encoder.Save(stream); return saved;
    }
}
