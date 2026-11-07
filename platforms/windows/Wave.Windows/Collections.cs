using System.IO;
using System.Text.Json;
namespace Wave.Windows;

public record NativePlaylist(string Id, string Name, string Description, List<string> TrackIds);
public record ListeningSession(List<string> Queue, string? CurrentId, double Position);
public record NativeMix(string Id, string Label, List<Song> Songs);
public static class NativeCollections
{
    /// <summary>"1 song", "12 songs": a count and its word, singular when it should be.</summary>
    public static string Count(int value, string singular) =>
        $"{value} {(value == 1 ? singular : singular + "s")}";
    public static List<NativeMix> DailyMixes(IEnumerable<Song> songs, DateOnly day)
    {
        string? Tag(string? value) => !string.IsNullOrWhiteSpace(value) &&
            System.Text.RegularExpressions.Regex.IsMatch(value, @"\p{L}") &&
            !new[] { "unknown", "unknown artist", "unknown genre", "other", "misc", "miscellaneous", "general" }.Contains(value.Trim().ToLowerInvariant()) ? value.Trim() : null;
        return songs.DistinctBy(s => s.Id)
            .Select(s => new { Song = s, Genre = Tag(s.Genre), Artist = Tag(s.Artist) })
            .Where(x => x.Genre != null || x.Artist != null)
            .GroupBy(x => (x.Genre != null ? "genre:" : "artist:") + (x.Genre ?? x.Artist)!.ToLowerInvariant())
            .Where(g => g.Count() >= 3).OrderBy(g => g.Key.StartsWith("genre:") ? 0 : 1).ThenByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal).Take(3)
            .Select(g => new NativeMix(g.Key, g.First().Genre ?? g.First().Artist!,
                g.Select(x => x.Song).OrderBy(s => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(day.ToString("yyyy-MM-dd") + s.Id))), StringComparer.Ordinal).Take(20).ToList())).ToList();
    }
    public static List<Song> Resolve(IEnumerable<string> ids, IEnumerable<Song> songs)
    {
        var known = songs.ToDictionary(s => s.Id);
        return ids.Distinct().Where(known.ContainsKey).Select(id => known[id]).ToList();
    }
    /// <summary>A blend long enough to be a mix rather than a fade, in seconds.</summary>
    public const double BlendSeconds = 24;
    /// <summary>The shortest blend on material long enough to have one.</summary>
    public const double MixFloorSeconds = 12;
    /// <summary>
    /// How long two songs overlap, in seconds.
    ///
    /// The same rule the web client uses: a fifth of the shorter song, no less
    /// than twelve seconds and no more than twenty-four, never more than half of
    /// it. Windows has no beat analysis, so the two are lined up on the seconds
    /// rather than on the bar; the length and the curve are the same ones, which
    /// is what makes the join sound like the same feature on both screens. Files
    /// too short to hold a real blend are left alone.
    /// </summary>
    public static double MixWindow(double outgoing, double incoming) =>
        double.IsFinite(outgoing) && double.IsFinite(incoming) && outgoing > 0 && incoming > 0 && Math.Min(outgoing, incoming) >= 24
            ? Math.Min(BlendSeconds, Math.Max(Math.Min(MixFloorSeconds, Math.Min(outgoing, incoming) / 4), Math.Min(outgoing, incoming) * .12))
            : 0;
    /// <summary>
    /// Staged handover, kept in step with the web build: the incoming song is at
    /// level by a quarter of the blend and holds, the outgoing song only leaves in
    /// the second half. Constant power throughout, so the join never dips.
    /// </summary>
    public static (double Outgoing, double Incoming) HandoverGains(double progress)
    {
        double p = Math.Clamp(progress, 0, 1);
        double phase = p < .28 ? .5 * Smooth(p / .28) : p < .62 ? .5 + .06 * Smooth((p - .28) / .34) : .56 + .44 * Smooth((p - .62) / .38);
        double angle = phase * Math.PI / 2;
        return (Math.Cos(angle), Math.Sin(angle));
    }
    private static double Smooth(double value) { double t = Math.Clamp(value, 0, 1); return t * t * (3 - 2 * t); }
    public static List<Song> Move(List<Song> queue, int from, int to)
    {
        var copy = queue.ToList();
        if (from < 0 || to < 0 || from >= copy.Count || to >= copy.Count) return copy;
        var song = copy[from]; copy.RemoveAt(from); copy.Insert(to, song); return copy;
    }
    public static void Save<T>(string folder, string name, T value)
    {
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, name);
        File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(value));
        File.Move(path + ".tmp", path, true);
    }
    public static T? Load<T>(string folder, string name) => File.Exists(Path.Combine(folder, name))
        ? JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(folder, name))) : default;
}
