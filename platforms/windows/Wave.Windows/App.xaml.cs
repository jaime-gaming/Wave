using System.IO;
using System.Windows;
using System.Windows.Media;
namespace Wave.Windows;
public partial class App : Application
{
    /// <summary>
    /// The six colours everything else refers to.
    ///
    /// Each key resolves to one brush instance that is created once and then
    /// recoloured. WPF does not re-resolve a DynamicResource when the dictionary
    /// that holds it is replaced quietly, so a swap left half the window on the
    /// old theme; changing the colour of a brush it already points at repaints
    /// everything that uses it.
    ///
    /// Two things can get in the way of that: WPF is free to freeze a brush once
    /// it is in a sealed dictionary, and a frozen brush is read-only. In that
    /// case the dictionary is taken out and put back with fresh brushes, which
    /// invalidates every DynamicResource rather than leaving any of them on the
    /// colour they first saw.
    /// </summary>
    private static readonly Dictionary<string, SolidColorBrush> palette = new();
    private static ResourceDictionary? held;

    public static void ApplyBrushes(bool light)
    {
        // The web palette, verbatim: src/styles.css is the only source of truth.
        // Background is the page, Surface is a card, Tonal is a raised card.
        var colors = new Dictionary<string, string> {
            ["BackgroundBrush"] = light ? "#ECEDF5" : "#10141F",
            ["SurfaceBrush"] = light ? "#FAF9FF" : "#1D2230",
            ["TonalBrush"] = light ? "#E1E2EF" : "#282E3E",
            ["InkBrush"] = light ? "#1A1D2B" : "#E3E5F1",
            ["MutedBrush"] = light ? "#555D70" : "#ACB2C4",
            ["AccentBrush"] = light ? "#375D98" : "#B0C7FF",
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
                // A sealed dictionary refuses the write; fall through to a swap.
            }
        }
        Current.Resources.MergedDictionaries.Remove(held);
        Current.Resources.MergedDictionaries.Add(fresh);
        held = fresh;
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
