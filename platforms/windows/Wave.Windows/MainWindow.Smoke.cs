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
            UpdateLayout();
            var root = (FrameworkElement)Content;
            if (root.ActualWidth < 1 || root.ActualHeight < 1) throw new Exception("Native root did not lay out.");
            // The window's own background is not part of its content, so a capture
            // without it is a transparent PNG that most viewers show as white and
            // that hides light text. Paint the theme colour behind the content.
            if (root is Panel panel) panel.Background = Background;
            var bitmap = new RenderTargetBitmap((int)root.ActualWidth, (int)root.ActualHeight, 96, 96, PixelFormats.Pbgra32); bitmap.Render(root);
            var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap)); using var stream = File.Create(Path.Combine(output, name + ".png")); png.Save(stream);
        }
        void Check(bool result, string text) { if (!result) throw new Exception(text); }
        await Capture("home-dark");
        Check(CollectionHeader.Children.OfType<System.Windows.Controls.Primitives.UniformGrid>().First().Children.Count == 5, "Home collection shortcuts missing.");
        Check(Songs.Visibility == Visibility.Collapsed, "Home should read as one page, not a list under a shelf.");
        Check(MiniPlayer.Visibility == Visibility.Collapsed, "Empty mini player should be hidden.");
        ShowPage("Search"); searchBox!.Text = "Local song 3"; Check(visible.Count == 1, "Native search failed.");
        ShowPage("Daily mix", DailyGroups()[0].Id); Check(visible.Count == 3, "Native daily mix is not browsable.");
        Check(Summary.Text.Contains("·"), "A browsing page should count the library under its title.");
        await Capture("daily-mix");
        var snapshot = new NativePlaylist("smoke", "Morning collection", "Saved local selection", visible.Select(s => s.Id).ToList());
        SavePlaylists(new() { snapshot }); ShowPage("Playlists", snapshot.Id); Check(visible.Count == 3, "Playlist snapshot lost songs."); await Capture("playlist");
        // Remix over the seeded week: one card, then the list it earns.
        ShowPage("Remix");
        var remixText = CollectionHeader.Children.OfType<TextBlock>().Select(text => text.Text).ToList();
        Check(remixText.Contains("This week"), "Remix should open with this week.");
        Check(remixText.Contains("Your Remix"), "Remix should list the week's songs.");
        Check(remixText.Any(text => text.EndsWith("vs last week")), "Remix should compare with the week before.");
        await Capture("remix");
        ShowPage("Settings"); // Back is a button too, so seven: one way out and six sections.
        Check(SettingsBody.Children.OfType<Button>().Count() == 7, "Expected Back and six Settings sections."); await Capture("settings");
        // The player view has no song behind it here, which is exactly the empty
        // case worth a look: the record, the lyrics area and the transport should
        // still sit where they belong.
        ShowPage("Now playing"); await Capture("now-playing");
        Check(NowView.Visibility == Visibility.Visible, "The player view should be the one on screen.");
        ShowPage("Library");
        preferences = preferences with { Theme = "light" }; ApplyTheme(); Width = 820; Height = 640; ShowPage("Library"); await Capture("library-light-narrow");
    }
}
