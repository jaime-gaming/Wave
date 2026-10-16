using System.IO;
using System.Windows;
using System.Windows.Media;
namespace Wave.Windows;
public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        if (e.Args.Length == 2 && e.Args[0] == "--smoke-test") {
            string output = Path.GetFullPath(e.Args[1]); Directory.CreateDirectory(output);
            string folder = Path.Combine(Path.GetTempPath(), "wave-ui-smoke-" + Guid.NewGuid());
            try {
                RenderOptions.ProcessRenderMode = System.Windows.Interop.RenderMode.SoftwareOnly;
                var repository = new Library(folder);
                repository.Save(Enumerable.Range(0, 9).Select(i => new Song(i.ToString(), "Local song " + i, "Artist " + i / 3, "Album " + i / 3, "demo.wav", Path.Combine(folder, "demo.wav"), 90, Genre: new[] { "Rock", "Jazz", "Electronic" }[i / 3])).ToList());
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
