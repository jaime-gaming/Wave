using System.IO;
using System.Windows;
using System.Windows.Media;
namespace Wave.Windows;
public partial class App : Application
{















    private static readonly Dictionary<string, SolidColorBrush> palette = new();
    private static ResourceDictionary? held;

    public static void ApplyBrushes(bool light)
    {


        var colors = new Dictionary<string, string> {
            ["BackgroundBrush"] = light ? "#ECEDF5" : "#10141F",
            ["SurfaceBrush"] = light ? "#FAF9FF" : "#1D2230",
            ["TonalBrush"] = light ? "#E1E2EF" : "#282E3E",
            ["InkBrush"] = light ? "#1A1D2B" : "#E3E5F1",
            ["MutedBrush"] = light ? "#555D70" : "#ACB2C4",
            ["AccentBrush"] = light ? "#375D98" : "#B0C7FF",
            ["AccentTonalBrush"] = light ? "#CCDDFF" : "#324773",
            ["OnAccentBrush"] = light ? "#FFFFFF" : "#092E62",
        };
        var fresh = new ResourceDictionary();
        bool replacedFrozen = false;
        foreach (var (key, value) in colors) {
            if (!palette.TryGetValue(key, out var brush) || brush.IsFrozen) {
                brush = new SolidColorBrush();
                palette[key] = brush;
                replacedFrozen = held != null;
            }
            brush.Color = (Color)ColorConverter.ConvertFromString(value);
            fresh[key] = brush;
        }
        if (held == null) { Current.Resources.MergedDictionaries.Add(fresh); held = fresh; return; }
        if (!replacedFrozen) {
            try {
                foreach (var (key, brush) in palette) held[key] = brush;
                return;
            } catch (InvalidOperationException) {

            }
        }
        Current.Resources.MergedDictionaries.Remove(held);
        Current.Resources.MergedDictionaries.Add(fresh);
        held = fresh;
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        ApplyBrushes(light: false);
        if (e.Args.Length == 2 && e.Args[0] == "--smoke-test") {
            string output = Path.GetFullPath(e.Args[1]); Directory.CreateDirectory(output);
            string folder = Path.Combine(Path.GetTempPath(), "wave-ui-smoke-" + Guid.NewGuid());
            try {
                RenderOptions.ProcessRenderMode = System.Windows.Interop.RenderMode.SoftwareOnly;
                var repository = new Library(folder);
                repository.Save(Enumerable.Range(0, 9).Select(i => new Song(i.ToString(), "Local song " + i, "Artist " + i / 3, "Album " + i / 3, "demo.wav", Path.Combine(folder, "demo.wav"), 90, Genre: new[] { "Rock", "Jazz", "Electronic" }[i / 3])).ToList());

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
