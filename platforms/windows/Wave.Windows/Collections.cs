using System.IO;
using System.Security.Cryptography;
using System.Text;
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

    private static string DayHash(string seed) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed)));

    private static string ArtistKey(Song song) =>
        (song.Artist ?? "").Trim().ToLowerInvariant();

    /// <summary>
    /// Caps any dominant artist and spaces artists widely (4-slot cooldown) so
    /// Daily Mixes never burn out a single artist with back-to-back repeats.
    /// </summary>
    private static List<Song> CurateMixSongs(IEnumerable<Song> pool, DateOnly day, string groupKey)
    {
        var dayKey = day.ToString("yyyy-MM-dd");
        var shuffled = pool
            .OrderBy(s => DayHash($"{dayKey}:{groupKey}:{s.Id}"), StringComparer.Ordinal)
            .ToList();

        var distinctArtists = shuffled.Select(ArtistKey).Distinct().Count();
        int maxPerArtist = distinctArtists >= 6 ? 2 : distinctArtists >= 3 ? 3 : 20;

        var selected = new List<Song>(20);
        var overflow = new List<Song>();
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var song in shuffled)
        {
            var key = ArtistKey(song);
            counts.TryGetValue(key, out int seen);
            if (seen < maxPerArtist)
            {
                selected.Add(song);
                counts[key] = seen + 1;
            }
            else
            {
                overflow.Add(song);
            }
            if (selected.Count >= 20) break;
        }
        foreach (var song in overflow)
        {
            if (selected.Count >= 20) break;
            selected.Add(song);
        }

        // Wide artist spacing (4-slot cooldown window)
        var remaining = new List<Song>(selected);
        var ordered = new List<Song>(selected.Count);
        var recentArtists = new Queue<string>();
        while (remaining.Count > 0)
        {
            int bestIndex = 0;
            int bestPenalty = int.MaxValue;
            var recentList = recentArtists.ToList();
            for (int i = 0; i < remaining.Count; i++)
            {
                var key = ArtistKey(remaining[i]);
                int lastPos = recentList.LastIndexOf(key);
                int penalty = lastPos < 0 ? 0 : (lastPos + 1) * 100;
                if (ordered.Count > 0 && ArtistKey(ordered[^1]) == key) penalty += 10000;
                if (penalty < bestPenalty)
                {
                    bestPenalty = penalty;
                    bestIndex = i;
                    if (penalty == 0) break;
                }
            }
            var pick = remaining[bestIndex];
            remaining.RemoveAt(bestIndex);
            ordered.Add(pick);
            recentArtists.Enqueue(ArtistKey(pick));
            if (recentArtists.Count > 4) recentArtists.Dequeue();
        }
        return ordered;
    }

    public static List<NativeMix> DailyMixes(IEnumerable<Song> songs, DateOnly day)
    {
        string? Tag(string? value) => !string.IsNullOrWhiteSpace(value) &&
            System.Text.RegularExpressions.Regex.IsMatch(value, @"\p{L}") &&
            !new[] { "unknown", "unknown artist", "unknown genre", "other", "misc", "miscellaneous", "general" }
                .Contains(value.Trim().ToLowerInvariant())
            ? value.Trim()
            : null;

        var unique = songs.DistinctBy(s => s.Id).ToList();
        var genreGroups = unique
            .Select(s => new { Song = s, Genre = Tag(s.Genre) })
            .Where(x => x.Genre != null)
            .GroupBy(x => "genre:" + x.Genre!.ToLowerInvariant())
            .Where(g => g.Count() >= 3)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => (Key: g.Key, Label: g.First().Genre!, Songs: g.Select(x => x.Song).ToList()))
            .ToList();

        var chosen = new List<(string Key, string Label, List<Song> Songs)>();
        if (genreGroups.Count > 0)
        {
            // Keep top group stable + rotate remaining groups daily for freshness
            chosen.Add(genreGroups[0]);
            var rest = genreGroups.Skip(1)
                .OrderBy(g => DayHash($"{day:yyyy-MM-dd}:slot:{g.Key}"), StringComparer.Ordinal)
                .Take(2);
            chosen.AddRange(rest);
        }
        else if (unique.Count >= 3)
        {
            // Multi-artist fallback mix when library has no genre tags
            var distinctArtists = unique.Select(ArtistKey).Distinct().Count();
            if (distinctArtists >= 2)
            {
                chosen.Add(("mix:daily", "Daily Mix", unique));
            }
            else
            {
                var artistGroups = unique
                    .Select(s => new { Song = s, Artist = Tag(s.Artist) })
                    .Where(x => x.Artist != null)
                    .GroupBy(x => "artist:" + x.Artist!.ToLowerInvariant())
                    .Where(g => g.Count() >= 3)
                    .OrderByDescending(g => g.Count())
                    .Take(3)
                    .Select(g => (Key: g.Key, Label: g.First().Artist!, Songs: g.Select(x => x.Song).ToList()));
                chosen.AddRange(artistGroups);
            }
        }

        return chosen
            .Take(3)
            .Select(g => new NativeMix(g.Key, g.Label, CurateMixSongs(g.Songs, day, g.Key)))
            .ToList();
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

    public static double MixWindow(double outgoing, double incoming) =>
        double.IsFinite(outgoing) && double.IsFinite(incoming) && outgoing > 0 && incoming > 0 && Math.Min(outgoing, incoming) >= 24
            ? Math.Min(BlendSeconds, Math.Max(Math.Min(MixFloorSeconds, Math.Min(outgoing, incoming) / 4), Math.Min(outgoing, incoming) * .12))
            : 0;

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
