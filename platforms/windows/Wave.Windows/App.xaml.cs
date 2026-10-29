using System.IO;
using System.Windows;
using System.Windows.Media;
namespace Wave.Windows;
public partial class App : Application
{
    /// <summary>
    /// The six colours everything else refers to.
    ///
    /// They live in one dictionary that is replaced whole, because replacing
    /// entries one by one leaves elements that already resolved them showing the
    /// previous theme — a window would keep its old background while the buttons
    /// inside it turned.
    /// </summary>
    public static void ApplyBrushes(bool light)
    {
        var brushes = new ResourceDictionary();
        foreach (var (key, value) in new[] {
            ("BackgroundBrush", light ? "#F5F4FA" : "#10131B"),
            ("SurfaceBrush", light ? "#FFFBFF" : "#1B1F2A"),
            ("TonalBrush", light ? "#E5E5F2" : "#2B3042"),
            ("InkBrush", light ? "#202331" : "#E5E7F0"),
            ("MutedBrush", light ? "#535B70" : "#B3B9CC"),
            ("AccentBrush", light ? "#405C96" : "#B6C8FF"),
        }) brushes[key] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(value));
        var dictionaries = Current.Resources.MergedDictionaries;
        if (dictionaries.Count > 0) dictionaries[0] = brushes;
        else dictionaries.Add(brushes);
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // Before the first window resolves a colour.
        ApplyBrushes(light: false);
        if (e.Args.Length == 2 && e.Args[0] == "--smoke-test") {
            string output = Path.GetFullPath(e.Args[1]); Directory.CreateDirectory(output);
            string folder = Path.Combine(Path.GetTempPath(), "wave-ui-smoke-" + Guid.NewGuid());
            try {
                RenderOptions.ProcessRenderMode = System.Windows.Interop.RenderMode.SoftwareOnly;
                var repository = new Library(folder);
                repository.Save(Enumerable.Range(0, 9).Select(i => new Song(i.ToString(), "Local song " + i, "Artist " + i / 3, "Album " + i / 3, "demo.wav", Path.Combine(folder, "demo.wav"), 90, Genre: new[] { "Rock", "Jazz", "Electronic" }[i / 3])).ToList());
                // A week of plays, so Remix has a week to show instead of an empty card.
                var history = new List<Play>();
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                for (int round = 0; round < 9; round++) history = Listening.Add(folder, history, new Play((round % 3).ToString(), now - round * 3_600_000L, 120 + round * 10, true));
                history = Listening.Add(folder, history, new Play("0", now - 8L * 24 * 60 * 60 * 1000, 200, true));
                var window = new MainWindow(folder); MainWindow = window; window.Show();
                await window.SmokeInterface(output);
                File.WriteAllText(Path.Combine(output, "result.txt"), "PASS: native WPF Home, Search, genre mix, playlist, settings, dark/light layouts. No playback or physical device certification.");
                window.Close(); Shutdown(0);
            } catch (Exception error) { File.WriteAllText(Path.Combine(output, "error.txt"), error.ToString()); Shutdown(1); }
            finally { if (Directory.Exists(folder)) Directory.Delete(folder, true); }
            return;
        }
        MainWindow = new MainWindow(); MainWindow.Show();
    }
}
