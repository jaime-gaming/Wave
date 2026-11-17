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
    bool Linked = false)
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

    public List<Song> Load() =>
        File.Exists(Index) ? JsonSerializer.Deserialize<List<Song>>(File.ReadAllText(Index)) ?? [] : [];

    public void Save(List<Song> songs)
    {
        Directory.CreateDirectory(Folder);
        var temp = Index + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(songs));
        File.Move(temp, Index, true);
    }

    public Preferences LoadPreferences()
    {
        var path = System.IO.Path.Combine(Folder, "preferences.json");
        return File.Exists(path)
            ? JsonSerializer.Deserialize<Preferences>(File.ReadAllText(path)) ?? new(Mix: true)
            : new(Mix: true);
    }

    public void SavePreferences(Preferences value)
    {
        Directory.CreateDirectory(Folder);
        var path = System.IO.Path.Combine(Folder, "preferences.json");
        File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(value));
        File.Move(path + ".tmp", path, true);
    }

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
        foreach (var rawPath in paths)
        {
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

            songs = Load();
            var song = new Song(
                hash,
                rawTitle,
                artist,
                album,
                info.Name,
                storedPath,
                metadata.Duration,
                Genre: metadata.Genre,
                Linked: linked);
            songs.Add(song);
            try
            {
                Save(songs);
            }
            catch
            {
                if (!linked && File.Exists(storedPath)) File.Delete(storedPath);
                throw;
            }
            knownIds.Add(hash);
            knownPaths.Add(fullPath);
            count++;
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

public record Tags(string? Title = null, string? Artist = null, string? Album = null, double Duration = 0, string? Genre = null);

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
                if (total <= 1048576)
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
                        at += 10 + n;
                    }
                }
            }
            return new(title, artist, album, duration, genre);
        }
        catch { return new(); }
    }
}
