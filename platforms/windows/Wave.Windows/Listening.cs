using System.IO;
namespace Wave.Windows;

/// <summary>One listen, as it was heard.</summary>
public record Play(string SongId, long At, int Seconds, bool Completed);

/// <summary>One day of the week, so the recap can be drawn as bars.</summary>
public record DaySlice(long At, int Seconds, int Plays);

/// <summary>The week split by the genre tags on the files.</summary>
public record GenreSlice(string Genre, int Seconds, int Plays);

/// <summary>The week as one card, and the list it earns.</summary>
public record WeekRecap(long Start, long End, int Seconds, int Plays, int Tracks, int Artists,
    int PreviousSeconds, List<(Song Song, int Count)> TopSongs, List<(string Artist, int Count)> TopArtists, List<Song> Songs,
    List<DaySlice> Days, List<int> Hours, List<GenreSlice> Genres);

/// <summary>What the Remix page shows, built only from the songs still here.</summary>
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
    private const long WeekMillis = 7L * 24 * 60 * 60 * 1000;

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
        var week = all.Where(p => now - p.At is >= 0 and <= WeekMillis).ToList();
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

    public const int RemixLength = 12;

    /// <summary>
    /// The last seven local days, compared with the seven before them, and the
    /// songs they earn. The week comes first; a thin week is topped up from the
    /// all-time list so the Remix is a playlist rather than a footnote.
    /// </summary>
    public static WeekRecap Recap(List<Play> plays, List<Song> songs, long now)
    {
        var byId = songs.DistinctBy(s => s.Id).ToDictionary(s => s.Id);
        var end = StartOfDay(now);
        var start = end.AddDays(-6).TicksToMillis();
        var previousStart = end.AddDays(-13).TicksToMillis();
        var week = plays.Where(p => p.At >= start).ToList();
        var previous = plays.Where(p => p.At >= previousStart && p.At < start).ToList();

        var counts = new Dictionary<string, int>();
        var artists = new Dictionary<string, int>();
        // The same plays counted three more ways: a bar per day, a column per
        // hour, a slice per genre. Deleted songs still fill the first two.
        var daySeconds = new int[7];
        var dayPlays = new int[7];
        var hours = new int[24];
        var genres = new Dictionary<string, (int Seconds, int Plays)>();
        foreach (var play in week)
        {
            var local = DateTimeOffset.FromUnixTimeMilliseconds(play.At).LocalDateTime;
            int dayIndex = Math.Clamp((int)(StartOfDay(play.At) - StartOfDay(start)).TotalDays, 0, 6);
            daySeconds[dayIndex] += play.Seconds;
            dayPlays[dayIndex]++;
            hours[local.Hour]++;
            if (!byId.TryGetValue(play.SongId, out var song)) continue;
            counts[song.Id] = counts.GetValueOrDefault(song.Id) + 1;
            var name = string.IsNullOrWhiteSpace(song.Artist) ? "Unknown artist" : song.Artist;
            artists[name] = artists.GetValueOrDefault(name) + 1;
            var genre = song.Genre?.Trim();
            if (!string.IsNullOrEmpty(genre))
                genres[genre] = (genres.GetValueOrDefault(genre).Seconds + play.Seconds, genres.GetValueOrDefault(genre).Plays + 1);
        }
        var top = counts.Where(entry => byId.ContainsKey(entry.Key))
            .Select(entry => (Song: byId[entry.Key], Count: entry.Value))
            .OrderByDescending(entry => entry.Count)
            .ThenBy(entry => entry.Song.Title, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        var mix = top.Select(entry => entry.Song).ToList();
        if (mix.Count < RemixLength)
        {
            var seen = mix.Select(s => s.Id).ToHashSet();
            foreach (var entry in Summarise(plays, songs, now).TopSongs)
            {
                if (mix.Count >= RemixLength) break;
                if (!seen.Add(entry.Song.Id)) continue;
                mix.Add(entry.Song);
            }
        }
        return new WeekRecap(start, end.TicksToMillis(),
            // Every play this week, deleted songs included: they were heard, and
            // the bars have to add up to the headline.
            week.Sum(p => p.Seconds), week.Count,
            counts.Count, artists.Count, previous.Sum(p => p.Seconds), top.Take(8).ToList(),
            artists.OrderByDescending(entry => entry.Value).ThenBy(entry => entry.Key, StringComparer.CurrentCultureIgnoreCase)
                .Take(3).Select(entry => (entry.Key, entry.Value)).ToList(),
            mix.Take(RemixLength).ToList(),
            Enumerable.Range(0, 7)
                .Select(index => new DaySlice(start + index * 24L * 60 * 60 * 1000, daySeconds[index], dayPlays[index]))
                .ToList(),
            hours.ToList(),
            genres.OrderByDescending(entry => entry.Value.Seconds)
                .Select(entry => new GenreSlice(entry.Key, entry.Value.Seconds, entry.Value.Plays))
                .ToList());
    }

    /// <summary>"23 – 29 Oct": the window a recap covers, in one line.</summary>
    public static string WeekRange(long start, long end)
    {
        var first = DateTimeOffset.FromUnixTimeMilliseconds(start).LocalDateTime;
        var last = DateTimeOffset.FromUnixTimeMilliseconds(end).LocalDateTime;
        var format = "MMM";
        return first.Month == last.Month
            ? $"{first.Day} \u2013 {last.Day} {last.ToString(format, System.Globalization.CultureInfo.CurrentCulture)}"
            : $"{first.Day} {first.ToString(format, System.Globalization.CultureInfo.CurrentCulture)} \u2013 {last.Day} {last.ToString(format, System.Globalization.CultureInfo.CurrentCulture)}";
    }

    private static DateTime StartOfDay(long at) =>
        DateTimeOffset.FromUnixTimeMilliseconds(at).LocalDateTime.Date;
}

internal static class ClockExtensions
{
    public static long TicksToMillis(this DateTime value) =>
        new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Local)).ToUnixTimeMilliseconds();
}
