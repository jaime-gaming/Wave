using Wave.Windows;
using System.Text.Json;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); }
var a = new Song("a", "First", "Artist", "Album", "a.wav", "a.wav");
var b = a with { Id = "b", Title = "Second" };
Check(NativeCollections.Resolve(new[] { "b", "missing", "b", "a" }, new[] { a, b }).Select(s => s.Id).SequenceEqual(new[] { "b", "a" }), "ordered playlist snapshot excludes missing/duplicate IDs");
Check(Math.Abs(NativeCollections.MixWindow(90, 60) - 7.2) < .00001 && NativeCollections.MixWindow(8, 90) == 0 && NativeCollections.MixWindow(double.NaN, 90) == 0, "automatic bounded mix window");
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
