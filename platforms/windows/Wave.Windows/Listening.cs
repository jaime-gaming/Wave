using System.IO;
namespace Wave.Windows;

/// <summary>One listen, as it was heard.</summary>
public record Play(string SongId, long At, int Seconds, bool Completed);

/// <summary>What the listening page shows, built only from the songs still here.</summary>
public record ListeningSummary(int TotalSeconds, int WeekSeconds, int WeekPlays, int UniqueSongs,
    List<(Song Song, int Count)> TopSongs, List<(string Artist, int Count)> TopArtists, List<Song> Recent);

/// <summary>
/// Counting what was heard, and reading it back.
///
/// The rules match the web and Android builds: a listen counts at half the song,
/// capped at thirty seconds and never under five, one row per run, and the newest
/// two thousand kept. A deleted song keeps its seconds in the total, because the
/// time was still spent, but never appears in a list.
/// </summary>
public static class Listening
{
    public const int ThresholdSeconds = 30;
    public const int Keep = 2000;
    private const long Week = 7L * 24 * 60 * 60 * 1000;

    public static int Threshold(double duration) =>
        !double.IsFinite(duration) || duration <= 0 ? ThresholdSeconds
        : Math.Max(5, Math.Min(ThresholdSeconds, (int)(duration / 2)));

    public static bool Counts(int seconds, double duration) => seconds >= Threshold(duration);

    public static List<Play> Load(string folder) =>
        NativeCollections.Load<List<Play>>(folder, "history.json") ?? [];

    public static List<Play> Add(string folder, List<Play> plays, Play play)
    {
        var updated = plays.Append(play).OrderBy(p => p.At).ToList();
        if (updated.Count > Keep) updated = updated.TakeLast(Keep).ToList();
        NativeCollections.Save(folder, "history.json", updated);
        return updated;
    }

    public static void Clear(string folder) =>
        NativeCollections.Save(folder, "history.json", new List<Play>());

    public static ListeningSummary Summarise(IEnumerable<Play> plays, List<Song> songs, long now)
    {
        var all = plays.ToList();
        var known = songs.DistinctBy(s => s.Id).ToDictionary(s => s.Id);
        var live = all.Where(p => known.ContainsKey(p.SongId)).ToList();
        var week = all.Where(p => now - p.At is >= 0 and <= Week).ToList();
        var weekLive = week.Where(p => known.ContainsKey(p.SongId)).ToList();
        var counts = live.GroupBy(p => p.SongId).ToDictionary(g => g.Key, g => g.Count());
        var topSongs = counts
            .Where(entry => known.ContainsKey(entry.Key))
            .Select(entry => (Song: known[entry.Key], Count: entry.Value))
            .OrderByDescending(entry => entry.Count).ThenBy(entry => entry.Song.Title, StringComparer.CurrentCultureIgnoreCase)
            .Take(5).ToList();
        var topArtists = live
            .Select(p => known[p.SongId].Artist is { Length: > 0 } artist ? artist : "Unknown artist")
            .GroupBy(artist => artist).Select(g => (Artist: g.Key, Count: g.Count()))
            .OrderByDescending(entry => entry.Count).ThenBy(entry => entry.Artist, StringComparer.CurrentCultureIgnoreCase)
            .Take(5).ToList();
        var recent = live.OrderByDescending(p => p.At)
            .Select(p => known[p.SongId]).DistinctBy(s => s.Id).Take(20).ToList();
        return new ListeningSummary(
            all.Sum(p => p.Seconds), weekLive.Sum(p => p.Seconds), weekLive.Count,
            counts.Count, topSongs, topArtists, recent);
    }

    /// <summary>Time in words: "3 min" reads better than "0:03:00" on this page.</summary>
    public static string Time(int seconds)
    {
        if (seconds < 60) return "less than a minute";
        int minutes = seconds / 60;
        if (minutes < 60) return $"{minutes} min";
        int hours = minutes / 60, rest = minutes % 60;
        return rest == 0 ? $"{hours} h" : $"{hours} h {rest} min";
    }
}
