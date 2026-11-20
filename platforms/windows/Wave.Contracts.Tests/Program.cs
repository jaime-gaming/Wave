using Wave.Windows;
using System.Text.Json;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); }
var sleep = new SleepTimer();
var sleepStart = new DateTimeOffset(2026, 11, 16, 12, 0, 0, TimeSpan.Zero);
sleep.Set(15, sleepStart);
Check(sleep.RemainingMinutes(sleepStart.AddMinutes(14)) == 1 && !sleep.Expired(sleepStart.AddMinutes(14)), "sleep timer uses elapsed time");
Check(sleep.Expired(sleepStart.AddMinutes(16)), "sleep timer expires after sleep or a delayed tick");
sleep.Cancel();
Check(!sleep.Expired(sleepStart.AddHours(2)), "cancelled sleep timer stays off");
var a = new Song("a", "First", "Artist", "Album", "a.wav", "a.wav");
var b = a with { Id = "b", Title = "Second" };
Check(NativeCollections.Resolve(new[] { "b", "missing", "b", "a" }, new[] { a, b }).Select(s => s.Id).SequenceEqual(new[] { "b", "a" }), "ordered playlist snapshot excludes missing/duplicate IDs");
Check(Math.Abs(NativeCollections.MixWindow(90, 60) - 12) < .00001
    && Math.Abs(NativeCollections.MixWindow(180, 180) - 21.6) < .00001
    && Math.Abs(NativeCollections.MixWindow(400, 400) - 24) < .00001
    && NativeCollections.MixWindow(8, 90) == 0
    && NativeCollections.MixWindow(double.NaN, 90) == 0, "automatic bounded mix window");
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

var tooSmall = Enumerable.Range(0, 6).Select(i => a with { Id = $"small-{i}", Genre = "Rock" }).ToList();
Check(NativeCollections.DailyMixes(tooSmall, new DateOnly(2026, 10, 16)).Count == 0, "daily mixes require at least seven songs");
var tagged = Enumerable.Range(0, 8).Select(i => a with { Id = i.ToString(), Genre = "Rock", Artwork = $"art-{i % 4}.png" }).ToList();
var rockMix = NativeCollections.DailyMixes(tagged, new DateOnly(2026, 10, 16)).Single();
Check(rockMix.Label == "Rock" && rockMix.Songs.Count == 8, "daily mix uses actual genre tags");
Check(rockMix.Covers != null && rockMix.Covers.Count == 3 && rockMix.Covers.Select(c => c.Artwork).Distinct().Count() == 3, "daily mix locks distinct covers for the calendar day");
Check(NativeCollections.DailyMixes(tagged.Select(s => s with { Genre = null, Artist = "---" }), new DateOnly(2026, 10, 16)).Count == 0, "unknown styles are not fabricated");

// A listener's folder cover is used without changing the original music.
var artFolder = Path.Combine(Path.GetTempPath(), "wave-art-" + Guid.NewGuid());
try {
    Directory.CreateDirectory(artFolder);
    var cover = Path.Combine(artFolder, "cover.jpg");
    File.WriteAllBytes(cover, new byte[] { 0xff, 0xd8, 0xff, 0xd9 });
    Check(Library.FindFolderArtwork(Path.Combine(artFolder, "song.mp3")) == cover, "folder cover lookup preserves the original file");
} finally { if (Directory.Exists(artFolder)) Directory.Delete(artFolder, true); }

// Safe file URI and corrupt-JSON recovery from rolling .bak backup.
Check(Library.SafeFileUri(Path.Combine(Path.GetTempPath(), "Track #1 [100%].mp3")).AbsoluteUri.Contains("%231"), "file URIs preserve # and % safely");
var recoveryFolder = Path.Combine(Path.GetTempPath(), "wave-recover-" + Guid.NewGuid());
try {
    NativeCollections.Save(recoveryFolder, "session.json", new ListeningSession(new() { "a" }, "a", 4.0));
    NativeCollections.Save(recoveryFolder, "session.json", new ListeningSession(new() { "a", "b" }, "b", 9.5));
    File.WriteAllText(Path.Combine(recoveryFolder, "session.json"), "{corrupt-truncated");
    var recovered = NativeCollections.Load<ListeningSession>(recoveryFolder, "session.json");
    Check(recovered != null && recovered.CurrentId == "a", "corrupted storage recovers cleanly from rolling backup");
} finally { if (Directory.Exists(recoveryFolder)) Directory.Delete(recoveryFolder, true); }

// 100% local NativeMood engine & Autoplay selection.
var ambientSong = a with { Id = "amb", Title = "Midnight Ocean Rain", Genre = "Ambient", Artist = "Soft One" };
var technoSong = a with { Id = "tec", Title = "Turbo Rave Fire", Genre = "Techno", Artist = "Loud Two" };
var ambientVec = NativeMood.AnalyzeSong(ambientSong);
var technoVec = NativeMood.AnalyzeSong(technoSong);
Check(technoVec.Energy > ambientVec.Energy + 0.4, "local mood engine distinguishes calm and energetic music");
var moodSession = NativeMood.InferSession(
    new[] { ambientSong, technoSong },
    new[] {
        new NativeMoodSignal("amb", 190, 200, true, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 30_000),
        new NativeMoodSignal("tec", 4, 200, false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 5_000),
    },
    ambientSong);
Check(moodSession.Energy < 0.45, "local mood engine anchors full listens and repels quick skips");

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

// The language table: Spanish answers a known line, placeholders fill, English
// keeps the original wording, and an unknown line falls back to itself.
Localization.Init("es");
Check(Localization.T("Play") == "Reproducir", "the Spanish table answers a known line");
Check(Localization.T("Daily mix {number}", new Dictionary<string, string> { ["number"] = "3" }) == "Mezcla diaria 3", "placeholders fill in Spanish");
Localization.Init("en");
Check(Localization.T("Play") == "Play", "the English choice keeps the original wording");
Check(Localization.T("A line nobody translated") == "A line nobody translated", "an unknown line falls back to itself");
Localization.Init("system");

var crowdedMixes = Enumerable.Range(0, 5).SelectMany(g => Enumerable.Range(0, 35).Select(i => a with { Id = $"mix-{g}-{i}", Genre = $"Style {g}" }));
var boundedMixes = NativeCollections.DailyMixes(crowdedMixes, new DateOnly(2026, 11, 6));
Check(boundedMixes.Count == 3 && boundedMixes.All(mix => mix.Songs.Count == 20), "daily mixes are capped at three lists and twenty songs");

// Monthly & Yearly Remix recaps.
var monthly = Listening.MonthlyRecap(weekPlays, new List<Song> { a, b }, weekNow);
var yearly = Listening.YearlyRecap(weekPlays, new List<Song> { a, b }, weekNow);
Check(monthly.Plays >= week.Plays && yearly.Plays >= monthly.Plays && yearly.Seconds == 820, "monthly and yearly Remix recaps aggregate plays cleanly");

// Wave 3.0 native parity: automatic profiles, all-window Remix measurements
// and instrumental Mix planning on bars/pulse/tempo.
Check(NativePerformance.Profile(new DeviceSignals(ReducedMotion: true)) == NativeDeviceProfile.Lite, "reduced motion selects the automatic lite profile");
Check(NativePerformance.Profile(new DeviceSignals(MemoryGB: 8, Cores: 8)) == NativeDeviceProfile.Full, "capable hardware keeps the full profile");
Check(NativePerformance.Profile(new DeviceSignals(MemoryGB: 2, Cores: 2, LowPowerMode: true)) == NativeDeviceProfile.Lite, "low-power modest hardware selects lite");
var phoneRemix = NativeLayout.Remix(360, 740, 1, NativeDeviceProfile.Full);
var tabletRemix = NativeLayout.Remix(820, 1180, 1, NativeDeviceProfile.Balanced);
var fourKRemix = NativeLayout.Remix(3840, 2160, 1, NativeDeviceProfile.Full);
Check(phoneRemix.Columns == 1 && tabletRemix.Columns == 2 && fourKRemix.Columns == 4, "Remix columns adapt from phones to tablets to 4K");
Check(phoneRemix.MaxContentWidth == 360 && fourKRemix.MaxContentWidth == 3840, "Remix never reserves an empty right-hand strip");
Check(fourKRemix.HeroSize > phoneRemix.HeroSize && fourKRemix.Padding >= phoneRemix.Padding, "Remix type and spacing scale with the window");

string PulseLyrics(int start) => string.Join("\n", Enumerable.Range(0, 80).Select(i => {
    int seconds = start + i * 2;
    return $"[{seconds / 60:00}:{seconds % 60:00}.00]Line {i}";
}));
var pulseA = a with { Id = "pulse-a", Duration = 240, Bpm = 120, BarOffset = .05, Lyrics = PulseLyrics(30) };
var pulseB = a with { Id = "pulse-b", Duration = 240, Bpm = 120, BarOffset = .05, Lyrics = PulseLyrics(30) };
var equalPulse = NativePulse.Plan(pulseA, pulseB);
Check(equalPulse != null && equalPulse.PulseAligned && equalPulse.Bars == 9 && Math.Abs(equalPulse.Overlap - 18) < .001, "equal-tempo instrumentals meet on both downbeats for nine bars");
var driftingPulse = NativePulse.Plan(pulseA, pulseB with { Id = "pulse-c", Bpm = 126 });
Check(driftingPulse != null && driftingPulse.Bars < equalPulse!.Bars, "different tempos keep the bar-aligned overlap short enough to avoid drift");
var taggedBpm = NativePulse.Grid(pulseA);
var inferredBpm = NativePulse.EstimatedBpm(NativePulse.LrcStamps(pulseA with { Bpm = null, BarOffset = null }.Lyrics));
Check(taggedBpm != null && Math.Abs(taggedBpm.Bpm - 120) < .001, "optional local tempo tags describe the Mix grid");
Check(inferredBpm != null && Math.Abs(inferredBpm.Value - 120) < .001, "steady local LRC timings infer the same pulse without a tag");
Check(NativePulse.Plan(pulseA with { Bpm = null, BarOffset = null }, pulseB with { Bpm = null, BarOffset = null }) != null, "LRC-inferred pulses still align both instrumental edges");

// Detected outgoing endings: a natural fade to zero and an echo tail cut at 75 %.
var endingFade = a with { Id = "ending-fade", Duration = 200, Bpm = 120, Lyrics = "[02:50.00]Last line" };
var endingEcho = a with { Id = "ending-echo", Duration = 200, Bpm = 120, Lyrics = "[03:16.00]Last line" };
Check(NativeEnding.Detect(endingFade) == NativeEndingShape.FadeToZero && NativeEnding.Detect(endingEcho) == NativeEndingShape.EchoCut, "Mix endings vary with the detected outgoing tail");
Check(Math.Abs(NativeEnding.Cut(NativeEndingShape.EchoCut) - .75) < 1e-9 && NativeEnding.Cut(NativeEndingShape.FadeToZero) == 1, "echo tail cuts at 75 % of the fade");
var echoAtCut = NativeEnding.Gains(.75, NativeEndingShape.EchoCut);
Check(NativeEnding.Gains(.74, NativeEndingShape.EchoCut).Outgoing > 0 && echoAtCut.Outgoing == 0 && echoAtCut.Incoming == 1, "echo tail is released before reaching zero");
