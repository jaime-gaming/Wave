using System.IO;
using System.Text.Json;
namespace Wave.Windows;

public record NativePlaylist(string Id, string Name, string Description, List<string> TrackIds);
public record ListeningSession(List<string> Queue, string? CurrentId, double Position);
public static class NativeCollections
{
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
