using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace Wave.Windows;

public record NativePlaylist(string Id, string Name, string Description, List<string> TrackIds);
public record ListeningSession(List<string> Queue, string? CurrentId, double Position);
public record NativeMix(string Id, string Label, List<Song> Songs, List<Song>? Covers = null);
public record NativeMoodSignal(string SongId, int Seconds, double Duration, bool Completed, long At);
public record NativeMoodVector(double Energy, double Valence, double Intensity, double Intimacy);

/// <summary>
/// 100% local mood & listening engine synchronized with Wave Web 0.2.2.
/// Analyzes bilingual EN/ES genres, title/album semantics, dwell vs quick-skip
/// engagement, session momentum, and personal local time-of-day habits strictly on-device.
/// </summary>
public static class NativeMood
{
    private static readonly (string[] Tokens, NativeMoodVector Vec)[] GenreProfiles =
    [
        (["ambient", "drone", "sleep", "meditation", "soundscape"], new(0.14, 0.48, 0.12, 0.94)),
        (["lo-fi", "lofi", "chill", "downtempo", "lounge", "trip-hop"], new(0.28, 0.52, 0.22, 0.82)),
        (["classical", "piano", "instrumental", "soundtrack", "orchestral", "neoclassical"], new(0.30, 0.48, 0.25, 0.86)),
        (["jazz", "bossa", "acoustic", "folk", "unplugged", "trova"], new(0.36, 0.54, 0.28, 0.76)),
        (["ballad", "balada", "bolero", "blues", "sad", "shoegaze", "dream pop", "emo"], new(0.32, 0.24, 0.32, 0.76)),
        (["soul", "r&b", "rnb", "flamenco", "tango", "corrido"], new(0.50, 0.55, 0.45, 0.64)),
        (["synthwave", "retrowave", "darkwave", "vaporwave", "outrun"], new(0.68, 0.44, 0.62, 0.62)),
        (["indie", "alternative", "alt-rock", "post-punk", "britpop"], new(0.58, 0.48, 0.54, 0.48)),
        (["pop", "disco", "funk", "k-pop", "dance-pop", "synth-pop"], new(0.76, 0.80, 0.62, 0.24)),
        (["reggaeton", "reggaetón", "latin", "salsa", "bachata", "cumbia", "afrobeat", "reggae"], new(0.78, 0.82, 0.68, 0.22)),
        (["house", "edm", "electronic", "trance", "club", "phonk"], new(0.84, 0.66, 0.78, 0.30)),
        (["techno", "dubstep", "dnb", "drum & bass", "hardstyle", "rave", "hyperpop"], new(0.92, 0.45, 0.92, 0.35)),
        (["hip-hop", "rap", "trap", "drill", "urbano"], new(0.70, 0.48, 0.74, 0.36)),
        (["rock", "classic rock", "hard rock", "grunge"], new(0.76, 0.52, 0.78, 0.28)),
        (["metal", "punk", "hardcore", "metalcore"], new(0.94, 0.28, 0.96, 0.22)),
    ];

    private static readonly (string[] Words, double Energy, double Valence, double Intensity, double Intimacy)[] LexicalCues =
    [
        (["night", "midnight", "moon", "neon", "shadow", "dark", "noche", "medianoche", "luna", "madrugada", "oscuro"], -0.06, -0.10, 0, 0.22),
        (["sad", "tears", "alone", "lonely", "heartbreak", "rain", "goodbye", "triste", "soledad", "dolor", "lluvia", "nostalgia", "desamor"], -0.14, -0.26, -0.10, 0.20),
        (["calm", "quiet", "sleep", "dream", "soft", "ocean", "waves", "peace", "sunset", "calma", "suave", "brisa", "mar", "paz", "silencio"], -0.22, 0.08, -0.20, 0.22),
        (["dance", "party", "summer", "sunshine", "happy", "smile", "fiesta", "bailar", "verano", "feliz", "alegria", "euforia"], 0.20, 0.24, 0.12, -0.18),
        (["fire", "run", "power", "electric", "storm", "rush", "fuego", "fuerza", "tormenta", "velocidad", "energia"], 0.22, 0.0, 0.22, -0.16),
    ];

    public static NativeMoodVector AnalyzeSong(Song song)
    {
        double e = 0.50, v = 0.50, i = 0.50, n = 0.50, w = 0.4;
        var genre = (song.Genre ?? "").Trim().ToLowerInvariant();
        if (genre.Length > 0)
        {
            foreach (var (tokens, vec) in GenreProfiles)
            {
                if (tokens.Any(tok => genre.Contains(tok, StringComparison.Ordinal)))
                {
                    e += vec.Energy * 1.4; v += vec.Valence * 1.4; i += vec.Intensity * 1.4; n += vec.Intimacy * 1.4;
                    w += 1.4;
                    break;
                }
            }
        }
        var text = $"{song.Title} {song.Album}".ToLowerInvariant();
        double de = 0, dv = 0, di = 0, dn = 0;
        foreach (var cue in LexicalCues)
        {
            if (cue.Words.Any(word => text.Contains(word, StringComparison.Ordinal)))
            {
                de += cue.Energy; dv += cue.Valence; di += cue.Intensity; dn += cue.Intimacy;
            }
        }
        return new NativeMoodVector(
            Math.Clamp(e / w + Math.Clamp(de, -0.32, 0.32), 0, 1),
            Math.Clamp(v / w + Math.Clamp(dv, -0.32, 0.32), 0, 1),
            Math.Clamp(i / w + Math.Clamp(di, -0.32, 0.32), 0, 1),
            Math.Clamp(n / w + Math.Clamp(dn, -0.32, 0.32), 0, 1));
    }

    public static string Classify(NativeMoodVector vec)
    {
        if (vec.Energy < 0.36 && vec.Valence < 0.35) return "Melancholic";
        if (vec.Energy < 0.38 && vec.Intimacy >= 0.80) return "Focus";
        if (vec.Energy < 0.42) return "Chill";
        if (vec.Intimacy >= 0.62 && vec.Valence < 0.48) return "Late Night";
        if (vec.Energy >= 0.82 && vec.Valence < 0.40) return "Intense";
        if (vec.Valence >= 0.68 && vec.Energy >= 0.60) return "Upbeat";
        return "Energetic";
    }

    public static double DwellWeight(int seconds, double duration, bool completed)
    {
        double ratio = duration > 0 ? Math.Clamp(seconds / duration, 0, 1) : 0;
        if (completed || ratio >= 0.85 || seconds >= 180) return 1.35;
        if (seconds >= 25 || (ratio >= 0.35 && seconds >= 12)) return 0.55 + ratio * 0.65;
        if (seconds >= 12) return 0.22;
        if (seconds >= 2) return -(0.40 - (seconds / 12.0) * 0.24);
        return 0;
    }

    public static double Similarity(NativeMoodVector a, NativeMoodVector b)
    {
        double de = (a.Energy - b.Energy) * 1.25;
        double dv = (a.Valence - b.Valence) * 1.15;
        double di = (a.Intensity - b.Intensity) * 1.0;
        double dn = (a.Intimacy - b.Intimacy) * 0.95;
        return Math.Clamp(1.0 - Math.Sqrt(de * de + dv * dv + di * di + dn * dn) / 2.2, 0, 1);
    }

    public static NativeMoodVector InferSession(
        IEnumerable<Song> tracks,
        IEnumerable<NativeMoodSignal> signals,
        Song? current,
        long? nowMs = null)
    {
        long now = nowMs ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var byId = tracks.DistinctBy(s => s.Id).ToDictionary(s => s.Id);
        var recent = signals.OrderByDescending(s => s.At).Take(14).ToList();
        var hour = DateTimeOffset.FromUnixTimeMilliseconds(now).LocalDateTime.Hour;
        var prior = hour is >= 22 or < 5
            ? new NativeMoodVector(0.38, 0.40, 0.36, 0.74)
            : hour is >= 6 and < 11
                ? new NativeMoodVector(0.56, 0.64, 0.46, 0.48)
                : new NativeMoodVector(0.54, 0.56, 0.48, 0.52);

        double e = prior.Energy * 0.28, v = prior.Valence * 0.28, i = prior.Intensity * 0.28, n = prior.Intimacy * 0.28, w = 0.28;
        var skips = new List<(NativeMoodVector Vec, double Weight)>();
        int posCount = 0;
        for (int idx = 0; idx < recent.Count; idx++)
        {
            var sig = recent[idx];
            if (!byId.TryGetValue(sig.SongId, out var song)) continue;
            double eng = DwellWeight(sig.Seconds, sig.Duration > 0 ? sig.Duration : song.Duration, sig.Completed);
            if (Math.Abs(eng) < 0.01) continue;
            double ageHours = Math.Max(0, (now - sig.At) / 3_600_000.0);
            double recency = Math.Pow(0.78, idx) * (0.25 + 0.75 * Math.Exp(-ageHours / 18.0));
            var vec = AnalyzeSong(song);
            if (eng > 0)
            {
                double weight = recency * eng;
                e += vec.Energy * weight; v += vec.Valence * weight; i += vec.Intensity * weight; n += vec.Intimacy * weight;
                w += weight; posCount++;
            }
            else skips.Add((vec, recency * Math.Abs(eng)));
        }
        if (posCount == 0 && current != null)
        {
            var cur = AnalyzeSong(current);
            e += cur.Energy * 1.5; v += cur.Valence * 1.5; i += cur.Intensity * 1.5; n += cur.Intimacy * 1.5;
            w += 1.5;
        }
        double ve = e / w, vv = v / w, vi = i / w, vn = n / w;
        foreach (var (vec, sw) in skips)
        {
            double push = Math.Min(0.28, sw * 0.28);
            ve += (ve - vec.Energy) * push;
            vv += (vv - vec.Valence) * push;
            vi += (vi - vec.Intensity) * push;
            vn += (vn - vec.Intimacy) * push;
        }
        return new NativeMoodVector(Math.Clamp(ve, 0, 1), Math.Clamp(vv, 0, 1), Math.Clamp(vi, 0, 1), Math.Clamp(vn, 0, 1));
    }

    /// <summary>
    /// Chooses the best local Autoplay continuation song by blending session mood,
    /// current song vibe, genre/album continuity, and artist variety.
    /// </summary>
    public static Song? PickAutoplayNext(
        IEnumerable<Song> library,
        Song current,
        IEnumerable<string> recentIds,
        IEnumerable<NativeMoodSignal> signals,
        Random? rng = null)
    {
        var avoid = recentIds.TakeLast(12).ToHashSet(StringComparer.Ordinal);
        var all = library.Where(s => s.Id != current.Id).ToList();
        if (all.Count == 0) return null;
        var candidates = all.Where(s => !avoid.Contains(s.Id)).ToList();
        if (candidates.Count == 0) candidates = all;

        var session = InferSession(library, signals, current);
        var curMood = AnalyzeSong(current);
        var weighted = candidates.Select(song =>
        {
            var mood = AnalyzeSong(song);
            double sim = Similarity(mood, session) * 0.65 + Similarity(mood, curMood) * 0.35;
            bool sameGenre = !string.IsNullOrWhiteSpace(song.Genre) &&
                string.Equals(song.Genre?.Trim(), current.Genre?.Trim(), StringComparison.OrdinalIgnoreCase);
            bool sameArtist = string.Equals(song.Artist, current.Artist, StringComparison.OrdinalIgnoreCase);
            double durationFit = song.Duration > 0 && current.Duration > 0
                ? Math.Min(song.Duration, current.Duration) / Math.Max(song.Duration, current.Duration)
                : 0.5;
            double score = (0.8 + Math.Max(0, sim - 0.32) * 6.5 + (sameGenre ? 2.4 : 0) + durationFit + (song.Favorite ? 0.5 : 0))
                * (sameArtist ? 0.45 : 1.0)
                * (sim < 0.42 ? 0.35 : 1.0);
            return (Song: song, Weight: Math.Max(0.05, score));
        }).ToList();

        double total = weighted.Sum(x => x.Weight);
        double ticket = (rng ?? Random.Shared).NextDouble() * total;
        foreach (var item in weighted)
        {
            ticket -= item.Weight;
            if (ticket <= 0) return item.Song;
        }
        return weighted[0].Song;
    }
}

public static class NativeCollections
{
    public const int MinDailyMixTracks = 7;
    public const int MaxDailyMixTracks = 20;
    public const int MaxDailyMixes = 3;

    /// <summary>"1 song", "12 songs": a count and its word, singular when it should be.</summary>
    public static string Count(int value, string singular) =>
        $"{value} {(value == 1 ? singular : singular + "s")}";

    private static string DayHash(string seed) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed)));

    private static string ArtistKey(Song song) =>
        (song.Artist ?? "").Trim().ToLowerInvariant();

    /// <summary>
    /// Selects up to 3 distinct cover artworks locked to (day, groupKey) so covers
    /// never flicker or rotate while listening during the same calendar day.
    /// </summary>
    public static List<Song> MixCovers(IEnumerable<Song> songs, DateOnly day, string groupKey)
    {
        var dayKey = day.ToString("yyyy-MM-dd");
        var ordered = songs
            .DistinctBy(s => s.Id)
            .OrderBy(s => DayHash($"cover:{dayKey}:{groupKey}:{s.Id}"), StringComparer.Ordinal)
            .ToList();
        var picks = new List<Song>(3);
        var seenArt = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var song in ordered)
        {
            if (string.IsNullOrWhiteSpace(song.Artwork)) continue;
            if (seenArt.Add(song.Artwork))
            {
                picks.Add(song);
                if (picks.Count >= 3) return picks;
            }
        }
        foreach (var song in ordered)
        {
            if (picks.Any(p => p.Id == song.Id)) continue;
            picks.Add(song);
            if (picks.Count >= 3) break;
        }
        return picks;
    }

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
        int maxPerArtist = distinctArtists >= 6 ? 2 : distinctArtists >= 3 ? 3 : MaxDailyMixTracks;

        var selected = new List<Song>(MaxDailyMixTracks);
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
            if (selected.Count >= MaxDailyMixTracks) break;
        }
        foreach (var song in overflow)
        {
            if (selected.Count >= MaxDailyMixTracks) break;
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
            .Where(g => g.Count() >= MinDailyMixTracks)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => (Key: g.Key, Label: g.First().Genre!, Songs: g.Select(x => x.Song).ToList()))
            .ToList();

        var chosen = new List<(string Key, string Label, List<Song> Songs)>();
        if (genreGroups.Count > 0)
        {
            chosen.Add(genreGroups[0]);
            var rest = genreGroups.Skip(1)
                .OrderBy(g => DayHash($"{day:yyyy-MM-dd}:slot:{g.Key}"), StringComparer.Ordinal)
                .Take(MaxDailyMixes - 1);
            chosen.AddRange(rest);
        }
        else if (unique.Count >= MinDailyMixTracks)
        {
            var distinctArtists = unique.Select(ArtistKey).Distinct().Count();
            if (distinctArtists >= 2)
            {
                // Mood-grouped multi-artist Daily Mixes synchronized with Wave Web 0.2.2.
                var moodBuckets = unique
                    .GroupBy(s => NativeMood.Classify(NativeMood.AnalyzeSong(s)))
                    .Where(g => g.Count() >= MinDailyMixTracks)
                    .OrderByDescending(g => g.Count())
                    .ThenBy(g => g.Key, StringComparer.Ordinal)
                    .Select(g => (Key: "mood:" + g.Key.ToLowerInvariant(), Label: g.Key, Songs: g.ToList()))
                    .Take(MaxDailyMixes)
                    .ToList();
                if (moodBuckets.Count > 0) chosen.AddRange(moodBuckets);
                else chosen.Add(("mood:daily", "Daily Mix", unique));
            }
            else
            {
                var artistGroups = unique
                    .Select(s => new { Song = s, Artist = Tag(s.Artist) })
                    .Where(x => x.Artist != null)
                    .GroupBy(x => "artist:" + x.Artist!.ToLowerInvariant())
                    .Where(g => g.Count() >= MinDailyMixTracks)
                    .OrderByDescending(g => g.Count())
                    .Take(MaxDailyMixes)
                    .Select(g => (Key: g.Key, Label: g.First().Artist!, Songs: g.Select(x => x.Song).ToList()));
                chosen.AddRange(artistGroups);
            }
        }

        return chosen
            .Take(MaxDailyMixes)
            .Select(g =>
            {
                var curated = CurateMixSongs(g.Songs, day, g.Key);
                var covers = MixCovers(g.Songs, day, g.Key);
                return new NativeMix(g.Key, g.Label, curated, covers);
            })
            .Where(m => m.Songs.Count >= MinDailyMixTracks)
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

    public static void Save<T>(string folder, string name, T value) =>
        Library.WriteJsonAtomic(Path.Combine(folder, name), value);

    public static T? Load<T>(string folder, string name) =>
        Library.ReadJsonSafe<T>(Path.Combine(folder, name));
}
