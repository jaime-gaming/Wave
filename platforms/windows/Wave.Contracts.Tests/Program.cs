using Wave.Windows;
using System.Text.Json;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); }
var a = new Song("a", "First", "Artist", "Album", "a.wav", "a.wav");
var b = a with { Id = "b", Title = "Second" };
Check(NativeCollections.Resolve(new[] { "b", "missing", "b", "a" }, new[] { a, b }).Select(s => s.Id).SequenceEqual(new[] { "b", "a" }), "ordered playlist snapshot excludes missing/duplicate IDs");
Check(Math.Abs(NativeCollections.MixWindow(90, 60) - 12) < .00001 && NativeCollections.MixWindow(90, 90) == 16 && NativeCollections.MixWindow(8, 90) == 0 && NativeCollections.MixWindow(double.NaN, 90) == 0, "automatic bounded mix window");
var (handOut, handIn) = NativeCollections.HandoverGains(.25);
var (lateOut, lateIn) = NativeCollections.HandoverGains(.75);
Check(Math.Abs(handOut * handOut + handIn * handIn - 1) < 1e-9 && handIn > .6 && lateOut < .6 && lateIn > .8, "staged handover arrives early and leaves late");
var queue = new List<Song> { a, b };
Check(NativeCollections.Move(queue, 1, 0)[0].Id == "b" && queue[0].Id == "a", "queue movement does not mutate the active snapshot");
Check(JsonSerializer.Deserialize<Preferences>("{\"Crossfade\":0}") is { Mix: null, Crossfade: 0 }, "legacy disabled overlap remains disabled");
var folder = Path.Combine(Path.GetTempPath(), "wave-contracts-" + Guid.NewGuid());
try {
    NativeCollections.Save(folder, "session.json", new ListeningSession(new() { "b", "a" }, "a", 12.5));
    Check(NativeCollections.Load<ListeningSession>(folder, "session.json") is { CurrentId: "a", Position: 12.5 }, "listening state round trip");
    NativeCollections.Save(folder, "playlists.json", new[] { new NativePlaylist("mix", "Daily mix", "Snapshot", new() { "a", "b" }) });
    Check(NativeCollections.Load<List<NativePlaylist>>(folder, "playlists.json")![0].TrackIds.Count == 2, "playlist snapshot round trip");
} finally { if (Directory.Exists(folder)) Directory.Delete(folder, true); }

var tagged = Enumerable.Range(0, 4).Select(i => a with { Id = i.ToString(), Genre = "Rock" }).ToList();
Check(NativeCollections.DailyMixes(tagged, new DateOnly(2026, 10, 16)).Single().Label == "Rock", "daily mix uses actual genre tags");
Check(NativeCollections.DailyMixes(tagged.Select(s => s with { Genre = null, Artist = "---" }), new DateOnly(2026, 10, 16)).Count == 0, "unknown styles are not fabricated");

var retryNow = new DateTime(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc);
Check(LyricsClient.RetryDeadline(retryNow, new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(2))) == retryNow.AddSeconds(2), "short lyric Retry-After does not impose a minute");
Check(LyricsClient.RetryDeadline(retryNow, new System.Net.Http.Headers.RetryConditionHeaderValue(new DateTimeOffset(retryNow.AddSeconds(5)))) == retryNow.AddSeconds(5), "HTTP-date lyric Retry-After is honored");
Check(LyricsClient.RetryDeadline(retryNow, null) == retryNow.AddSeconds(60), "missing lyric Retry-After uses a conservative fallback");
Check(LyricsClient.RetryDeadline(retryNow, new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.Zero)) == retryNow.AddSeconds(1), "expired/zero lyric Retry-After avoids an immediate retry loop");

// Listening history: the same rules as the web and Android builds.
Check(Listening.Threshold(240) == 30 && Listening.Threshold(40) == 20 && Listening.Threshold(3) == 5, "a play needs half the song, at most thirty seconds, at least five");
Check(Listening.Counts(30, 240) && !Listening.Counts(29, 240) && !Listening.Counts(10, 40), "the play threshold matches the other builds");
var heardAt = new DateTimeOffset(2026, 10, 29, 12, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
var played = new List<Play> {
    new("a", heardAt - 2000, 40, true), new("a", heardAt - 1000, 50, true),
    new("b", heardAt - 500, 60, true), new("gone", heardAt - 400, 90, false),
    new("a", heardAt - 30L * 24 * 60 * 60 * 1000, 30, false),
};
var listened = Listening.Summarise(played, new List<Song> { a, b }, heardAt);
Check(listened.TotalSeconds == 270 && listened.WeekPlays == 3 && listened.UniqueSongs == 2, "a deleted song keeps its seconds but leaves the lists");
Check(listened.TopSongs[0].Song.Id == "a" && listened.TopSongs[0].Count == 3, "the most played song leads, counting every play");
Check(listened.Recent.Take(2).Select(s => s.Id).SequenceEqual(new[] { "b", "a" }), "recent listens are newest first");
Check(Listening.Time(20) == "less than a minute" && Listening.Time(120) == "2 min" && Listening.Time(3600) == "1 h" && Listening.Time(5400) == "1 h 30 min", "listening time reads as words");
var historyFolder = Path.Combine(Path.GetTempPath(), "wave-history-" + Guid.NewGuid());
try {
    var started = Listening.Add(historyFolder, new List<Play>(), played[0]);
    Check(Listening.Add(historyFolder, started, played[1]).Count == 2 && Listening.Load(historyFolder).Count == 2, "history round trip keeps one row per listen");
    Listening.Clear(historyFolder);
    Check(Listening.Load(historyFolder).Count == 0, "clearing history forgets every listen");
} finally { if (Directory.Exists(historyFolder)) Directory.Delete(historyFolder, true); }

// The week as one card, and the Remix list it earns.
var weekNow = new DateTimeOffset(2026, 10, 29, 20, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
long DaysAgo(int days) => weekNow - days * 24L * 60 * 60 * 1000;
var weekPlays = new List<Play> {
    new("a", DaysAgo(1), 200, true), new("a", DaysAgo(2), 200, true),
    new("b", DaysAgo(0), 120, true), new("b", DaysAgo(9), 300, true),
};
var week = Listening.Recap(weekPlays, new List<Song> { a, b }, weekNow);
Check(week.Seconds == 520 && week.Plays == 3 && week.Tracks == 2, "the recap counts only the last seven days");
Check(week.PreviousSeconds == 300, "the seven days before are the comparison, not the week");
Check(week.Songs.First().Id == "a" && week.TopSongs.First().Count == 2, "the week's most played song leads the Remix");
Check(Listening.WeekRange(week.Start, week.End).Contains("\u2013"), "the recap names its window in one line");
Check(week.Days.Count == 7 && week.Days.Sum(day => day.Seconds) == week.Seconds && week.Days.Sum(day => day.Plays) == week.Plays, "the week draws as seven bars that add up to its number");
Check(week.Hours.Count == 24 && week.Hours.Sum() == week.Plays, "the week has an hour for every play");
Check(Listening.Recap(weekPlays, new List<Song> { a with { Genre = "Ambient" }, b }, weekNow).Genres.First().Genre == "Ambient", "the week names its most played genre");
var thinWeek = Listening.Recap(new List<Play> { new("a", DaysAgo(0), 120, true) }, new List<Song> { a, b }, weekNow);
Check(thinWeek.Songs.Select(s => s.Id).Distinct().Count() == thinWeek.Songs.Count, "a topped-up Remix never repeats a song");
