using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace Wave.Windows;

public record Song(
    string Id,
    string Title,
    string Artist,
    string Album,
    string FileName,
    string Path,
    double Duration = 0,
    bool Favorite = false,
    string Lyrics = "",
    long CheckedAt = 0,
    string? Artwork = null,
    string? Genre = null,
    int PlayCount = 0,
    long LastPlayed = 0,
    bool Linked = false,
    double? Bpm = null,
    double? BarOffset = null)
{
    public string Caption => $"{Artist} · {Album} · {FileName}";
}

public record Preferences(
    double Crossfade = 0,
    bool OnlineLyrics = false,
    bool? Mix = null,
    bool Autoplay = true,
    double Volume = .8,
    string Theme = "dark",
    bool LargerText = false,
    bool Editor = false,
    bool Animations = true,
    string Language = "system",
    bool CopyFilesToLibrary = false,
    string? CustomAudioFolder = null,
    List<string>? WatchedFolders = null);

public sealed class Library
{
    public string Folder { get; } = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Wave");
    private string Index => System.IO.Path.Combine(Folder, "library.json");
    public string DefaultAudioFolder => System.IO.Path.Combine(Folder, "audio");

    public Library(string? folder = null)
    {
        if (folder != null) Folder = folder;
        Directory.CreateDirectory(Folder);
    }

    public string ResolveAudioFolder(Preferences? prefs = null)
    {
        var custom = prefs?.CustomAudioFolder;
        if (!string.IsNullOrWhiteSpace(custom))
        {
            try
            {
                var full = System.IO.Path.GetFullPath(custom.Trim());
                Directory.CreateDirectory(full);
                return full;
            }
            catch { /* Fall back to default audio folder if custom path is unavailable. */ }
        }
        Directory.CreateDirectory(DefaultAudioFolder);
        return DefaultAudioFolder;
    }

    public bool IsManagedCopy(Song song, Preferences? prefs = null)
    {
        if (song.Linked || string.IsNullOrWhiteSpace(song.Path)) return false;
        try
        {
            var fullSong = System.IO.Path.GetFullPath(song.Path);
            var defaultRoot = System.IO.Path.GetFullPath(DefaultAudioFolder)
                .TrimEnd(System.IO.Path.DirectorySeparatorChar) + System.IO.Path.DirectorySeparatorChar;
            if (fullSong.StartsWith(defaultRoot, StringComparison.OrdinalIgnoreCase)) return true;
            if (!string.IsNullOrWhiteSpace(prefs?.CustomAudioFolder))
            {
                var customRoot = System.IO.Path.GetFullPath(prefs.CustomAudioFolder.Trim())
                    .TrimEnd(System.IO.Path.DirectorySeparatorChar) + System.IO.Path.DirectorySeparatorChar;
                if (fullSong.StartsWith(customRoot, StringComparison.OrdinalIgnoreCase)) return true;
            }
        }
        catch { return false; }
        return false;
    }

    private static readonly object IoLock = new();

    /// <summary>
    /// Builds a safe absolute file URI that preserves special filename characters
    /// such as #, %, and ? so MediaPlayer and BitmapImage never misparse them.
    /// </summary>
    public static Uri SafeFileUri(string path)
    {
        var full = System.IO.Path.GetFullPath(path).Replace('\\', '/');
        var escaped = full
            .Replace("%", "%25")
            .Replace("#", "%23")
            .Replace("?", "%3F");
        if (!escaped.StartsWith('/')) escaped = "/" + escaped;
        return new Uri("file://" + escaped);
    }

    internal static void WriteJsonAtomic<T>(string path, T value)
    {
        var dir = System.IO.Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        var payload = JsonSerializer.Serialize(value);
        lock (IoLock)
        {
            var temp = $"{path}.{Guid.NewGuid():N}.tmp";
            var backup = path + ".bak";
            try
            {
                using (var stream = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false)))
                {
                    writer.Write(payload);
                    writer.Flush();
                }
                if (File.Exists(path))
                {
                    try { File.Copy(path, backup, true); } catch { /* Best-effort rolling backup. */ }
                }
                File.Move(temp, path, true);
            }
            finally
            {
                if (File.Exists(temp))
                {
                    try { File.Delete(temp); } catch { }
                }
            }
        }
    }

    internal static T? ReadJsonSafe<T>(string path)
    {
        lock (IoLock)
        {
            var backup = path + ".bak";
            foreach (var candidate in new[] { path, backup })
            {
                if (!File.Exists(candidate)) continue;
                try
                {
                    var text = File.ReadAllText(candidate);
                    if (string.IsNullOrWhiteSpace(text)) continue;
                    var parsed = JsonSerializer.Deserialize<T>(text);
                    if (parsed != null)
                    {
                        if (candidate == backup)
                        {
                            try { File.Copy(backup, path, true); } catch { }
                        }
                        return parsed;
                    }
                }
                catch
                {
                    if (candidate == path)
                    {
                        try { File.Move(path, path + ".corrupt", true); } catch { }
                    }
                }
            }
            return default;
        }
    }

    public List<Song> Load() => ReadJsonSafe<List<Song>>(Index) ?? [];

    public void Save(List<Song> songs) => WriteJsonAtomic(Index, songs);

    public Preferences LoadPreferences() =>
        ReadJsonSafe<Preferences>(System.IO.Path.Combine(Folder, "preferences.json")) ?? new(Mix: true);

    public void SavePreferences(Preferences value) =>
        WriteJsonAtomic(System.IO.Path.Combine(Folder, "preferences.json"), value);

    /// <summary>
    /// Imports audio files into the Wave library.
    /// By default (copyFiles = false), files are linked in-place at their original
    /// disk location without duplicating bytes into AppData. When copyFiles is
    /// explicitly enabled, copies are placed into the configured storage folder.
    /// </summary>
    public async Task<int> Import(IEnumerable<string> paths, bool copyFiles = false, string? customAudioFolder = null)
    {
        var songs = Load();
        var knownIds = new HashSet<string>(songs.Select(song => song.Id), StringComparer.OrdinalIgnoreCase);
        var knownPaths = new HashSet<string>(
            songs.Where(s => !string.IsNullOrWhiteSpace(s.Path)).Select(s =>
            {
                try { return System.IO.Path.GetFullPath(s.Path); } catch { return s.Path; }
            }),
            StringComparer.OrdinalIgnoreCase);

        string? copyRoot = null;
        if (copyFiles)
        {
            copyRoot = !string.IsNullOrWhiteSpace(customAudioFolder)
                ? System.IO.Path.GetFullPath(customAudioFolder.Trim())
                : DefaultAudioFolder;
            Directory.CreateDirectory(copyRoot);
        }

        int count = 0;
        var addedSongs = new List<Song>();
        var copiedPaths = new List<string>();
        foreach (var rawPath in paths)
        {
            if (string.IsNullOrWhiteSpace(rawPath) || !File.Exists(rawPath)) continue;
            var fullPath = System.IO.Path.GetFullPath(rawPath);
            if (knownPaths.Contains(fullPath)) continue;
            var info = new FileInfo(fullPath);
            if (info.Length is <= 0 or > 209715200)
                throw new IOException("Choose a nonempty file up to 200 MB.");

            await using var stream = File.OpenRead(fullPath);
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(stream)).ToLowerInvariant();
            if (knownIds.Contains(hash)) continue;

            string storedPath = fullPath;
            bool linked = true;
            if (copyFiles && copyRoot != null)
            {
                storedPath = System.IO.Path.Combine(copyRoot, hash + info.Extension.ToLowerInvariant());
                File.Copy(fullPath, storedPath, true);
                linked = false;
                copiedPaths.Add(storedPath);
            }

            var metadata = await Task.Run(() => Metadata.Read(fullPath));
            var (folderArtist, folderAlbum) = InferFolderTags(fullPath);
            var rawTitle = metadata.Title ?? StripTrackPrefix(System.IO.Path.GetFileNameWithoutExtension(fullPath));
            var artist = !string.IsNullOrWhiteSpace(metadata.Artist)
                ? metadata.Artist
                : folderArtist ?? "Unknown artist";
            var album = !string.IsNullOrWhiteSpace(metadata.Album)
                ? metadata.Album
                : folderAlbum ?? "Unknown album";

            var song = new Song(
                hash,
                rawTitle,
                artist,
                album,
                info.Name,
                storedPath,
                metadata.Duration,
                Artwork: SaveEmbeddedArtwork(hash, metadata.Artwork) ?? FindFolderArtwork(fullPath),
                Genre: metadata.Genre,
                Linked: linked);
            addedSongs.Add(song);
            knownIds.Add(hash);
            knownPaths.Add(fullPath);
            count++;
        }

        if (addedSongs.Count > 0)
        {
            var merged = Load();
            var mergedIds = new HashSet<string>(merged.Select(s => s.Id), StringComparer.OrdinalIgnoreCase);
            foreach (var song in addedSongs)
            {
                if (mergedIds.Add(song.Id)) merged.Add(song);
            }
            try
            {
                Save(merged);
            }
            catch
            {
                foreach (var copy in copiedPaths)
                {
                    try { if (File.Exists(copy)) File.Delete(copy); } catch { }
                }
                throw;
            }
        }
        return count;
    }

    /// <summary>
    /// Removes a song from the Wave library index. Original linked user files are
    /// NEVER deleted from disk; only Wave-managed copies inside the storage folder
    /// are cleaned up.
    /// </summary>
    public bool Remove(string id, Preferences? prefs = null)
    {
        var songs = Load();
        var target = songs.Find(s => s.Id == id);
        if (target == null) return false;
        songs.RemoveAll(s => s.Id == id);
        Save(songs);
        if (IsManagedCopy(target, prefs))
        {
            try { if (File.Exists(target.Path)) File.Delete(target.Path); } catch { /* Best-effort cleanup. */ }
        }
        return true;
    }

    private static string StripTrackPrefix(string name) =>
        System.Text.RegularExpressions.Regex.Replace(name, @"^\s*\d{1,3}\s*[-._)]\s+", "").Trim();

    private string? SaveEmbeddedArtwork(string id, byte[]? bytes)
    {
        if (bytes == null || bytes.Length is < 4 or > 6291456) return null;
        var isJpeg = bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff;
        var isPng = bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        if (!isJpeg && !isPng) return null;
        try
        {
            var folder = System.IO.Path.Combine(Folder, "artwork");
            Directory.CreateDirectory(folder);
            var target = System.IO.Path.Combine(folder, id + (isPng ? ".png" : ".jpg"));
            if (!File.Exists(target)) File.WriteAllBytes(target, bytes);
            return target;
        }
        catch { return null; }
    }

    /// <summary>Use a nearby album image without moving or editing the listener's files.</summary>
    public static string? FindFolderArtwork(string audioPath)
    {
        try
        {
            var folder = System.IO.Path.GetDirectoryName(audioPath);
            if (string.IsNullOrWhiteSpace(folder)) return null;
            foreach (var name in new[] { "cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "front.png" })
            {
                var candidate = System.IO.Path.Combine(folder, name);
                var file = new FileInfo(candidate);
                if (file.Exists && file.Length is > 0 and <= 6291456) return candidate;
            }
        }
        catch { /* Artwork is optional; missing permissions must not block playback. */ }
        return null;
    }

    private static (string? Artist, string? Album) InferFolderTags(string fullPath)
    {
        try
        {
            var dir = Directory.GetParent(fullPath);
            if (dir == null) return (null, null);
            var generic = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "music", "audio", "downloads", "download", "library", "songs", "tracks", "desktop", "documents"
            };
            var album = generic.Contains(dir.Name) ? null : dir.Name;
            var parent = dir.Parent;
            var artist = parent == null || generic.Contains(parent.Name) || parent.Parent == null
                ? null
                : parent.Name;
            return (artist, album);
        }
        catch { return (null, null); }
    }
}

public record Tags(string? Title = null, string? Artist = null, string? Album = null, double Duration = 0, string? Genre = null, byte[]? Artwork = null);

public static class Metadata
{
    public static Tags Read(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            using var reader = new BinaryReader(stream);
            var header = reader.ReadBytes(12);
            if (header.Length < 12) return new();
            string? title = null, artist = null, album = null, genre = null;
            byte[]? artwork = null;
            double duration = 0;
            if (Encoding.ASCII.GetString(header, 0, 4) == "RIFF" && Encoding.ASCII.GetString(header, 8, 4) == "WAVE")
            {
                uint rate = 0, size = 0;
                while (stream.Position + 8 <= stream.Length)
                {
                    var id = Encoding.ASCII.GetString(reader.ReadBytes(4));
                    uint length = reader.ReadUInt32();
                    long end = stream.Position + length + (length % 2);
                    if (end > stream.Length) break;
                    if (id == "fmt " && length >= 16) { reader.ReadBytes(8); rate = reader.ReadUInt32(); }
                    else if (id == "data") size = length;
                    else if (id == "LIST" && length <= 1048576)
                    {
                        var data = reader.ReadBytes((int)length);
                        if (data.Length >= 4 && Encoding.ASCII.GetString(data, 0, 4) == "INFO")
                            for (int at = 4; at + 8 <= data.Length;)
                            {
                                var key = Encoding.ASCII.GetString(data, at, 4);
                                int n = BitConverter.ToInt32(data, at + 4);
                                if (n < 0 || at + 8 + n > data.Length) break;
                                var value = Encoding.UTF8.GetString(data, at + 8, n).TrimEnd('\0');
                                if (key == "INAM") title = value;
                                if (key == "IART") artist = value;
                                if (key == "IPRD") album = value;
                                if (key == "IGNR") genre = value;
                                at += 8 + n + (n % 2);
                            }
                    }
                    stream.Position = end;
                }
                if (rate > 0) duration = (double)size / rate;
            }
            else if (Encoding.ASCII.GetString(header, 0, 3) == "ID3" && (header[3] == 3 || header[3] == 4))
            {
                int total = (header[6] << 21) | (header[7] << 14) | (header[8] << 7) | header[9];
                // Skip unsynchronised tags rather than treating encoded bytes as a picture.
                if (total <= 8388608 && (header[5] & 0x80) == 0)
                {
                    stream.Position = 10;
                    var data = reader.ReadBytes(total);
                    for (int at = 0; at + 10 <= data.Length;)
                    {
                        var key = Encoding.ASCII.GetString(data, at, 4);
                        int n = header[3] == 4
                            ? (data[at + 4] << 21) | (data[at + 5] << 14) | (data[at + 6] << 7) | data[at + 7]
                            : (data[at + 4] << 24) | (data[at + 5] << 16) | (data[at + 6] << 8) | data[at + 7];
                        if (n <= 0 || at + 10 + n > data.Length) break;
                        if (key is "TIT2" or "TPE1" or "TALB" or "TCON")
                        {
                            byte encoding = data[at + 10];
                            var bytes = data.AsSpan(at + 11, n - 1).ToArray();
                            var decoder = encoding switch { 0 => Encoding.Latin1, 1 => Encoding.Unicode, 2 => Encoding.BigEndianUnicode, _ => Encoding.UTF8 };
                            var value = decoder.GetString(bytes).Trim('\0', '\uFEFF');
                            if (key == "TIT2") title = value;
                            if (key == "TPE1") artist = value;
                            if (key == "TALB") album = value;
                            if (key == "TCON") genre = value;
                        }
                        if (key == "APIC" && artwork == null && n > 4 && (data[at + 9] == 0))
                        {
                            int begin = at + 10, end = begin + n;
                            byte encoding = data[begin];
                            int mimeEnd = Array.IndexOf(data, (byte)0, begin + 1, n - 1);
                            if (mimeEnd >= 0 && mimeEnd + 2 < end)
                            {
                                int desc = mimeEnd + 2;
                                int image = -1;
                                if (encoding == 0 || encoding == 3)
                                {
                                    int terminator = Array.IndexOf(data, (byte)0, desc, end - desc);
                                    if (terminator >= 0) image = terminator + 1;
                                }
                                else
                                {
                                    for (int i = desc; i + 1 < end; i += 2)
                                        if (data[i] == 0 && data[i + 1] == 0) { image = i + 2; break; }
                                }
                                if (image >= 0 && end - image is > 0 and <= 6291456)
                                    artwork = data.AsSpan(image, end - image).ToArray();
                            }
                        }
                        at += 10 + n;
                    }
                }
            }
            return new(title, artist, album, duration, genre, artwork);
        }
        catch { return new(); }
    }
}
