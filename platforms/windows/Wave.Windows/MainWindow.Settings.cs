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
        FontSize = preferences.LargerText ? 18 : 15;
    }
    private void RenderSettings(string? section = null)
    {
        SettingsBody.Children.Clear();
        SettingsBody.Children.Add(ActionButton(section == null ? "← Back" : "← Back to settings", () => { if (section == null) ShowPage(previousPage); else RenderSettings(); }));
        if (section == null) {
            foreach (var item in new[] { ("Appearance", "Theme, larger text and motion"), ("Playback", "Mix and local Autoplay"), ("Lyrics", "Optional automatic lyric search"), ("Library", "Song information and cover editing"), ("Storage", "Your original local files"), ("About", "Version, source and privacy") }) {
                var button = ActionButton(item.Item1, () => RenderSettings(item.Item1));
                button.HorizontalContentAlignment = HorizontalAlignment.Left; button.Padding = new Thickness(22, 18, 22, 18);
                var content = new StackPanel(); content.Children.Add(Label(item.Item1, 21)); content.Children.Add(Label(item.Item2, 14)); button.Content = content;
                SettingsBody.Children.Add(button);
            }
            return;
        }
        SettingsBody.Children.Add(Label(section, 30));
        void Toggle(string text, bool value, Action<bool> changed) {
            var check = new CheckBox { Content = text, IsChecked = value };
            check.Checked += (_, _) => { changed(true); preferencesDirty = true; SaveSession(); };
            check.Unchecked += (_, _) => { changed(false); preferencesDirty = true; SaveSession(); };
            SettingsBody.Children.Add(check);
        }
        switch (section) {
            case "Appearance":
                var themes = new WrapPanel();
                foreach (string theme in new[] { "dark", "light" }) themes.Children.Add(ActionButton(theme == "dark" ? "Dark" : "Light", () => { preferences = preferences with { Theme = theme }; preferencesDirty = true; ApplyTheme(); SaveSession(); }));
                SettingsBody.Children.Add(themes);
                Toggle("Larger text", preferences.LargerText, value => { preferences = preferences with { LargerText = value }; ApplyTheme(); });
                Toggle("Animations", preferences.Animations, value => preferences = preferences with { Animations = value }); break;
            case "Playback":
                Toggle("Mix", MixEnabled, value => { preferences = preferences with { Mix = value }; CancelFade(); PrepareNext(); });
                SettingsBody.Children.Add(Label("Automatically choose a short overlap for each pair. Original audio files and pitch stay unchanged."));
                Toggle("Autoplay", preferences.Autoplay, value => preferences = preferences with { Autoplay = value });
                SettingsBody.Children.Add(Label("Continue with another song from your local library when the queue ends.")); break;
            case "Lyrics":
                Toggle("Automatic lyrics", preferences.OnlineLyrics, value => preferences = preferences with { OnlineLyrics = value });
                SettingsBody.Children.Add(Label("Optional LRCLIB lookup sends song metadata and connection IP, never audio. Saved lyrics work offline. Manual search remains available in song options without starting playback.")); break;
            case "Library":
                Toggle("Enable library editing", preferences.Editor, value => preferences = preferences with { Editor = value });
                SettingsBody.Children.Add(Label("Edit titles, artists, albums and covers in song options. These changes never rewrite your original audio.")); break;
            case "Storage":
                SettingsBody.Children.Add(Label($"{tracks.Count} original files in {repository.Folder}. Keep your originals; deleting this folder removes this library."));
                SettingsBody.Children.Add(ActionButton("Open local library folder", () => Process.Start(new ProcessStartInfo(repository.Folder) { UseShellExecute = true }))); break;
            case "About":
                SettingsBody.Children.Add(Label("Wave 0.1.1 · 27 October 2026", 23));
                SettingsBody.Children.Add(Label("Your music. Your collection. No account required."));
                SettingsBody.Children.Add(ActionButton("Source code", () => Process.Start(new ProcessStartInfo("https://github.com/jaime-gaming/Wave") { UseShellExecute = true })));
                SettingsBody.Children.Add(Label("Use audio and lyrics you may lawfully access. See the repository privacy information.")); break;
        }
    }
    private void EditClick(object sender, RoutedEventArgs e) { if (Current != null) EditSong(Current); }
    private void EditSong(Song song)
    {
        var window = Dialog("Edit song / lyrics", 660); var root = new DockPanel { Margin = new Thickness(22) }; var fields = new StackPanel();
        var title = new TextBox { Text = song.Title, IsReadOnly = !preferences.Editor, MaxLength = 500 };
        var artist = new TextBox { Text = song.Artist, IsReadOnly = !preferences.Editor, MaxLength = 500 };
        var album = new TextBox { Text = song.Album, IsReadOnly = !preferences.Editor, MaxLength = 500 };
        var lyrics = new TextBox { Text = song.Lyrics, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 180, MaxLength = 100000, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        foreach (var pair in new[] { ("Title", title), ("Artist", artist), ("Album", album), ("Lyrics / LRC", lyrics) }) { fields.Children.Add(Label(pair.Item1)); fields.Children.Add(pair.Item2); }
        string? artwork = song.Artwork; string? selectedCover = null;
        if (preferences.Editor) fields.Children.Add(ActionButton("Choose cover", () => { var picker = new OpenFileDialog { Filter = "Images|*.png;*.jpg;*.jpeg" }; if (picker.ShowDialog(window) == true) selectedCover = picker.FileName; }));
        var status = Label(""); fields.Children.Add(status);
        var preview = new TextBox { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Visibility = Visibility.Collapsed };
        var use = ActionButton("Use found lyrics", () => { lyrics.Text = preview.Text; preview.Visibility = Visibility.Collapsed; status.Text = "Placed in your draft. Save to keep it."; });
        use.Visibility = Visibility.Collapsed;
        var search = ActionButton("Search online", () => { });
        var cancellation = new CancellationTokenSource();
        window.Closed += (_, _) => { cancellation.Cancel(); cancellation.Dispose(); };
        search.Click += async (_, _) => {
            search.IsEnabled = false; status.Text = "Searching LRCLIB…";
            try {
                string found = await client.Find(song with { Title = title.Text, Artist = artist.Text, Album = album.Text }, cancellation.Token);
                if (cancellation.IsCancellationRequested) return;
                preview.Text = found; preview.Visibility = use.Visibility = found.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
                status.Text = found.Length > 0 ? "Preview the result, then use and save it." : "No matching lyrics. Your draft is unchanged.";
            } catch (OperationCanceledException) { } catch (Exception error) { if (!cancellation.IsCancellationRequested) status.Text = error.Message; }
            finally { if (!cancellation.IsCancellationRequested) search.IsEnabled = true; }
        };
        fields.Children.Add(Label("Search sends title/artist to LRCLIB, not audio. Results are saved only when you choose Save."));
        fields.Children.Add(search); fields.Children.Add(preview); fields.Children.Add(use);
        var actions = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Right };
        actions.Children.Add(ActionButton("Cancel", window.Close));
        actions.Children.Add(ActionButton("Save", () => {
            try {
                if (title.Text.Trim().Length == 0) { status.Text = "Add a song title."; return; }
                if (selectedCover != null) artwork = SaveCover(selectedCover);
                var latest = tracks.Find(s => s.Id == song.Id); if (latest == null) { status.Text = "This song is no longer in your library."; return; }
                Update(latest with { Title = title.Text.Trim(), Artist = artist.Text.Trim(), Album = album.Text.Trim(), Lyrics = lyrics.Text, Artwork = artwork, CheckedAt = 0 }); window.Close();
            } catch (Exception error) { status.Text = error.Message; }
        }));
        DockPanel.SetDock(actions, Dock.Bottom); root.Children.Add(actions);
        root.Children.Add(new ScrollViewer { Content = fields, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }); window.Content = root; window.ShowDialog();
    }
    private string SaveCover(string path)
    {
        if (new FileInfo(path).Length > 10 * 1024 * 1024) throw new IOException("Choose a cover smaller than 10 MB.");
        var image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.DecodePixelWidth = 600; image.UriSource = new Uri(path); image.EndInit();
        if ((long)image.PixelWidth * image.PixelHeight > 4_000_000) throw new IOException("Choose a smaller cover.");
        string folder = Path.Combine(repository.Folder, "covers"); Directory.CreateDirectory(folder); string saved = Path.Combine(folder, Guid.NewGuid() + ".jpg");
        var encoder = new JpegBitmapEncoder { QualityLevel = 88 }; encoder.Frames.Add(BitmapFrame.Create(image)); using var stream = File.Create(saved); encoder.Save(stream); return saved;
    }
}
