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
            var bitmap = new RenderTargetBitmap((int)root.ActualWidth, (int)root.ActualHeight, 96, 96, PixelFormats.Pbgra32); bitmap.Render(root);
            var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap)); using var stream = File.Create(Path.Combine(output, name + ".png")); png.Save(stream);
        }
        void Check(bool result, string text) { if (!result) throw new Exception(text); }
        await Capture("home-dark");
        Check(CollectionHeader.Children.OfType<WrapPanel>().First().Children.Count == 5, "Home collection shortcuts missing.");
        Check(MiniPlayer.Visibility == Visibility.Collapsed, "Empty mini player should be hidden.");
        ShowPage("Search"); searchBox!.Text = "Local song 3"; Check(visible.Count == 1, "Native search failed.");
        ShowPage("Daily mix", DailyGroups()[0].Id); Check(visible.Count == 3, "Native daily mix is not browsable."); await Capture("daily-mix");
        var snapshot = new NativePlaylist("smoke", "Morning collection", "Saved local selection", visible.Select(s => s.Id).ToList());
        SavePlaylists(new() { snapshot }); ShowPage("Playlists", snapshot.Id); Check(visible.Count == 3, "Playlist snapshot lost songs."); await Capture("playlist");
        ShowPage("Settings"); Check(SettingsBody.Children.OfType<Button>().Count() == 7, "Expected Back and six Settings sections."); await Capture("settings");
        preferences = preferences with { Theme = "light" }; ApplyTheme(); Width = 820; Height = 640; ShowPage("Library"); await Capture("library-light-narrow");
    }
}
