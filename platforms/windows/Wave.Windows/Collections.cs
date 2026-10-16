using System.IO;
using System.Text.Json;
namespace Wave.Windows;

public record NativePlaylist(string Id, string Name, string Description, List<string> TrackIds);
public record ListeningSession(List<string> Queue, string? CurrentId, double Position);
public record NativeMix(string Id, string Label, List<Song> Songs);
public static class NativeCollections
{
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
                g.Select(x => x.Song).OrderBy(s => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(day.ToString("yyyy-MM-dd") + s.Id))), StringComparer.Ordinal).Take(30).ToList())).ToList();
    }
    public static List<Song> Resolve(IEnumerable<string> ids, IEnumerable<Song> songs)
    {
        var known = songs.ToDictionary(s => s.Id);
        return ids.Distinct().Where(known.ContainsKey).Select(id => known[id]).ToList();
    }
    public static double MixWindow(double outgoing, double incoming) =>
        double.IsFinite(outgoing) && double.IsFinite(incoming) && Math.Min(outgoing, incoming) >= 12
            ? Math.Clamp(Math.Min(outgoing, incoming) * .12, 1, 8) : 0;
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
