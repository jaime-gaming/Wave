using System.IO;
namespace Wave.Windows;


public record Play(string SongId, long At, int Seconds, bool Completed);


public record DaySlice(long At, int Seconds, int Plays);


public record GenreSlice(string Genre, int Seconds, int Plays);


public record WeekRecap(long Start, long End, int Seconds, int Plays, int Tracks, int Artists,
    int PreviousSeconds, List<(Song Song, int Count)> TopSongs, List<(string Artist, int Count)> TopArtists, List<Song> Songs,
    List<DaySlice> Days, List<int> Hours, List<GenreSlice> Genres);


public record ListeningSummary(int TotalSeconds, int WeekSeconds, int WeekPlays, int UniqueSongs,
    List<(Song Song, int Count)> TopSongs, List<(string Artist, int Count)> TopArtists, List<Song> Recent);









public static class Listening
{
    public const int ThresholdSeconds = 30;
    public const int Keep = 2000;

    public const int HistoryDays = 366;
    public const int HistoryPlays = 20000;
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


        var keepFrom = DateTimeOffset.UtcNow.AddDays(-HistoryDays).ToUnixTimeMilliseconds();
        var recent = updated.Where(p => p.At >= keepFrom).TakeLast(HistoryPlays).ToList();
        var older = updated.Where(p => p.At < keepFrom).ToList();
        var room = Math.Max(0, Keep - recent.Count);
        updated = [.. (room > 0 ? older.TakeLast(room) : []), .. recent];
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


    public static string Time(int seconds)
    {
        if (seconds < 60) return "less than a minute";
        int minutes = seconds / 60;
        if (minutes < 60) return $"{minutes} min";
        int hours = minutes / 60, rest = minutes % 60;
        return rest == 0 ? $"{hours} h" : $"{hours} h {rest} min";
    }

    public const int RemixLength = 12;






    public static WeekRecap Recap(List<Play> plays, List<Song> songs, long now, int weeksAgo = 0)
    {
        var byId = songs.DistinctBy(s => s.Id).ToDictionary(s => s.Id);
        var end = StartOfDay(now).AddDays(-7 * Math.Max(0, weeksAgo));
        var start = end.AddDays(-6).TicksToMillis();
        var finish = end.AddDays(1).TicksToMillis();
        var previousStart = end.AddDays(-13).TicksToMillis();


        var week = plays.Where(p => p.At >= start && p.At < finish).ToList();
        var previous = plays.Where(p => p.At >= previousStart && p.At < start).ToList();

        var counts = new Dictionary<string, int>();
        var artists = new Dictionary<string, int>();


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


    public static List<WeekRecap> Recaps(List<Play> plays, List<Song> songs, long now, int weeks = 4) =>
        Enumerable.Range(0, Math.Clamp(weeks, 1, 52)).Select(index => Recap(plays, songs, now, index)).ToList();


    public static WeekRecap RangeRecap(List<Play> plays, List<Song> songs, DateTime startDate, DateTime endDate, DateTime prevStart, DateTime prevEnd, long now)
    {
        var byId = songs.DistinctBy(s => s.Id).ToDictionary(s => s.Id);
        long start = startDate.TicksToMillis();
        long finish = endDate.AddDays(1).TicksToMillis();
        long pStart = prevStart.TicksToMillis();
        long pFinish = prevEnd.AddDays(1).TicksToMillis();
        var span = plays.Where(p => p.At >= start && p.At < finish).ToList();
        var prev = plays.Where(p => p.At >= pStart && p.At < pFinish).ToList();
        int totalDays = Math.Max(1, (int)(endDate - startDate).TotalDays + 1);
        int buckets = Math.Min(12, totalDays);
        var bucketSeconds = new int[buckets];
        var bucketPlays = new int[buckets];
        var hours = new int[24];
        var counts = new Dictionary<string, int>();
        var artists = new Dictionary<string, int>();
        var genres = new Dictionary<string, (int Seconds, int Plays)>();
        foreach (var play in span)
        {
            var local = DateTimeOffset.FromUnixTimeMilliseconds(play.At).LocalDateTime;
            int dayOffset = Math.Clamp((int)(local.Date - startDate).TotalDays, 0, totalDays - 1);
            int bucket = Math.Clamp((dayOffset * buckets) / totalDays, 0, buckets - 1);
            bucketSeconds[bucket] += play.Seconds;
            bucketPlays[bucket]++;
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
        long stepMs = Math.Max(86_400_000L, (finish - start) / buckets);
        return new WeekRecap(start, endDate.TicksToMillis(),
            span.Sum(p => p.Seconds), span.Count, counts.Count, artists.Count, prev.Sum(p => p.Seconds),
            top.Take(8).ToList(),
            artists.OrderByDescending(entry => entry.Value).ThenBy(entry => entry.Key, StringComparer.CurrentCultureIgnoreCase)
                .Take(3).Select(entry => (entry.Key, entry.Value)).ToList(),
            mix.Take(RemixLength).ToList(),
            Enumerable.Range(0, buckets)
                .Select(i => new DaySlice(start + i * stepMs, bucketSeconds[i], bucketPlays[i]))
                .ToList(),
            hours.ToList(),
            genres.OrderByDescending(entry => entry.Value.Seconds)
                .Select(entry => new GenreSlice(entry.Key, entry.Value.Seconds, entry.Value.Plays))
                .ToList());
    }


    public static WeekRecap MonthlyRecap(List<Play> plays, List<Song> songs, long now, int monthsAgo = 0)
    {
        var anchor = StartOfDay(now).AddMonths(-Math.Max(0, monthsAgo));
        var start = new DateTime(anchor.Year, anchor.Month, 1);
        var end = start.AddMonths(1).AddDays(-1);
        var prevStart = start.AddMonths(-1);
        var prevEnd = start.AddDays(-1);
        return RangeRecap(plays, songs, start, end, prevStart, prevEnd, now);
    }


    public static WeekRecap YearlyRecap(List<Play> plays, List<Song> songs, long now, int yearsAgo = 0)
    {
        int year = StartOfDay(now).Year - Math.Max(0, yearsAgo);
        var start = new DateTime(year, 1, 1);
        var end = new DateTime(year, 12, 31);
        var prevStart = new DateTime(year - 1, 1, 1);
        var prevEnd = new DateTime(year - 1, 12, 31);
        return RangeRecap(plays, songs, start, end, prevStart, prevEnd, now);
    }

    public static string MonthRange(long start) =>
        DateTimeOffset.FromUnixTimeMilliseconds(start).LocalDateTime.ToString("MMMM yyyy", System.Globalization.CultureInfo.CurrentCulture);

    public static string YearRange(long start) =>
        DateTimeOffset.FromUnixTimeMilliseconds(start).LocalDateTime.Year.ToString(System.Globalization.CultureInfo.InvariantCulture);

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
