using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
namespace Wave.Windows;
public partial class MainWindow
{
    internal async Task SmokeInterface(string output)
    {
        async Task Capture(string name) {
            await Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);



            await Task.Delay(420);
            await Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            UpdateLayout();
            var root = (FrameworkElement)Content;
            if (root.ActualWidth < 1 || root.ActualHeight < 1) throw new Exception("Native root did not lay out.");



            if (root is Panel panel) panel.Background = Background;
            var bitmap = new RenderTargetBitmap((int)root.ActualWidth, (int)root.ActualHeight, 96, 96, PixelFormats.Pbgra32); bitmap.Render(root);
            var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap)); using var stream = File.Create(Path.Combine(output, name + ".png")); png.Save(stream);
        }
        void Check(bool result, string text) { if (!result) throw new Exception(text); }
        await Capture("home-dark");
        var homeShortcuts = CollectionHeader.Children.OfType<System.Windows.Controls.Primitives.UniformGrid>().First();
        Check(homeShortcuts.Children.Count == 5, "Home collection shortcuts missing.");
        Check(homeShortcuts.Children.OfType<Button>().All(button => !string.IsNullOrEmpty(System.Windows.Automation.AutomationProperties.GetName(button))), "Home shortcuts need accessible names.");
        Width = 500; Height = 640;
        await Task.Delay(120); UpdateLayout();
        Check(homeShortcuts.Columns == 2, "Home shortcuts must fit a narrow window.");
        Width = 1280; Height = 860;
        await Task.Delay(120); UpdateLayout();
        Check(homeShortcuts.Columns == 5, "Home shortcuts should use the wide layout.");
        Check(Songs.Visibility == Visibility.Collapsed, "Home should read as one page, not a list under a shelf.");
        Check(MiniPlayer.Visibility == Visibility.Collapsed, "Empty mini player should be hidden.");
        ShowPage("Search");


        searchBox!.Text = "Album 1";
        var matches = CollectionHeader.Children.OfType<StackPanel>().FirstOrDefault(panel => Equals(panel.Tag, "search-matches"));
        Check(matches != null, "Search should name the collections it found, not only the songs.");
        Check(TextsIn(matches!).Any(text => text.Text == "Albums · 1"), "Search should group the album it found.");
        Check(matches!.Children.OfType<Button>().Count() == 1, "The album found by name should open from the search.");
        await Capture("search");
        searchBox.Text = "Local song 3"; Check(visible.Count == 1, "Native search failed.");
        var mix = DailyGroups().First();
        ShowPage("Daily mix", mix.Id); Check(visible.Select(s => s.Id).SequenceEqual(mix.Songs.Select(s => s.Id)) && visible.Count >= 7, "Native daily mix is not browsable.");
        Check(Summary.Text.Contains("·"), "A browsing page should count the library under its title.");
        await Capture("daily-mix");
        var snapshot = new NativePlaylist("smoke", "Morning collection", "Saved local selection", visible.Select(s => s.Id).ToList());
        SavePlaylists(new() { snapshot }); ShowPage("Playlists", snapshot.Id); Check(visible.Select(s => s.Id).SequenceEqual(snapshot.TrackIds), "Playlist snapshot lost songs."); await Capture("playlist");

        ShowPage("Remix");


        var remixText = TextsIn(CollectionHeader).Select(text => text.Text).ToList();
        Check(remixText.Contains("MOST PLAYED"), "Remix should show the sleeve of the week's song.");
        Check(remixText.Contains("Your Remix"), "Remix should list the week's songs.");
        Check(remixText.Any(text => text.EndsWith("vs last week")), "Remix should compare with the week before.");
        Check(!remixText.Contains("More about this week"), "Remix should not carry the old card stack.");
        await Capture("remix");
        ShowPage("Settings");
        Check(SettingsBody.Children.OfType<Button>().Count() == 7, "Expected Back and six Settings sections."); await Capture("settings");



        ShowPage("Now playing"); await Capture("now-playing");
        Check(NowView.Visibility == Visibility.Visible, "The player view should be the one on screen.");

        Volume.Value = .37;
        Check(Math.Abs(NowVolume.Value - .37) < .001, "Expanded volume must follow dock volume.");
        SoundClick(SoundButton, new RoutedEventArgs());
        Check(Volume.Value == 0 && NowVolume.Value == 0, "Mute must update both sliders.");
        SoundClick(NowSoundButton, new RoutedEventArgs());
        Check(Math.Abs(volume - .37) < .001, "Unmute must restore the previous level.");
        NowVolume.Value = .52;
        Check(Math.Abs(Volume.Value - .52) < .001, "Dock volume must follow expanded volume.");
        var motion = preferences.Animations;
        preferences = preferences with { Animations = false };
        Motion.IconAction(SoundButton, Motion.Enabled(preferences.Animations), "volume");
        Check(((FrameworkElement)SoundButton.Content).RenderTransform.Value.IsIdentity, "Disabled motion must leave the icon neutral.");
        preferences = preferences with { Animations = motion };
        // Force an animation regardless of the runner's system preference.
        CollapsePlayer(true);
        ShowPage("Search");
        await Task.Delay(350);
        Check(page == "Search", $"Interrupted collapse changed navigation to {page}.");
        Check(Math.Abs(NowView.Opacity - 1) < .001, $"Interrupted collapse left opacity at {NowView.Opacity}.");
        ShowPage("Library");
        preferences = preferences with { Theme = "light" }; ApplyTheme(); Width = 820; Height = 640; ShowPage("Library"); await Capture("library-light-narrow");

        // The list is virtualized; its data and queue must not be truncated to the
        // device's decorative/performance budget.
        var originalTracks = tracks;
        try {
            tracks = Enumerable.Range(0, 120).Select(index => new Song(
                $"bulk-{index}", $"Bulk track {index:D3}", "Artist", "Album", $"{index}.wav", $"{index}.wav")).ToList();
            ShowPage("Library");
            Check(visible.Count == 120 && visible[^1].Id == "bulk-119", "The full library must remain browsable.");
            ShowPage("Search");
            searchBox!.Text = "Bulk track";
            Check(visible.Count == 120, "Search results must not be truncated.");
        } finally { tracks = originalTracks; }
    }


    private static IEnumerable<TextBlock> TextsIn(DependencyObject root)
    {
        for (int index = 0; index < VisualTreeHelper.GetChildrenCount(root); index++)
        {
            var child = VisualTreeHelper.GetChild(root, index);
            if (child is TextBlock block) yield return block;
            foreach (var nested in TextsIn(child)) yield return nested;
        }
    }
}
