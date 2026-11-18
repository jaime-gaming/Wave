using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.IO;
using System.Windows;
using System.Diagnostics;

namespace Wave.Windows;

public partial class MainWindow
{
    // Release checks are advisory: never download or replace an executable without consent.
    private async Task CheckForUpdate()
    {
        try {
            var marker = Path.Combine(repository.Folder, "update-check.json");
            UpdateCheck? previous = null;
            try { if (File.Exists(marker)) previous = JsonSerializer.Deserialize<UpdateCheck>(await File.ReadAllTextAsync(marker)); } catch { }
            if (previous != null && DateTime.UtcNow - previous.Checked < TimeSpan.FromDays(1)) return;
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Wave-Windows");
            using var response = await client.GetAsync("https://api.github.com/repos/jaime-gaming/Wave/releases/latest");
            if (!response.IsSuccessStatusCode) return;
            var json = await response.Content.ReadAsStringAsync();
            if (json.Length > 1_000_000) return;
            using var document = JsonDocument.Parse(json);
            var tag = document.RootElement.GetProperty("tag_name").GetString() ?? "";
            var raw = tag.TrimStart('v');
            if (raw.Split('.').Length != 3 || !Version.TryParse(raw, out var latest)) return;
            var installed = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0);
            bool newer = latest > new Version(installed.Major, installed.Minor, installed.Build);
            bool announce = newer && tag != previous?.Announced;
            await File.WriteAllTextAsync(marker, JsonSerializer.Serialize(new UpdateCheck(DateTime.UtcNow, announce ? tag : previous?.Announced)));
            if (!announce || !IsLoaded) return;
            var message = Localization.T("A newer version ({version}) is available. Download the Windows package and replace the existing Wave files; keep your local library.", new Dictionary<string, string> { ["version"] = tag });
            if (MessageBox.Show(this, message, Localization.T("Wave update available"), MessageBoxButton.YesNo, MessageBoxImage.Information) == MessageBoxResult.Yes)
                Process.Start(new ProcessStartInfo("https://github.com/jaime-gaming/Wave/releases/latest") { UseShellExecute = true });
        } catch { /* Offline, rate-limited and invalid responses do not interrupt playback. */ }
    }
    private record UpdateCheck(DateTime Checked, string? Announced);
}
