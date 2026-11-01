namespace Wave.Windows;

/// <summary>
/// Searching the library, ranked the way a person means it.
///
/// The window used to filter and leave the results in whatever order the library
/// held them, so typing the first word of a title could put three unrelated songs
/// above it. The ladder here is the same one the site and the phone use: the exact
/// title, a title that starts with the words, a word inside the title, the same
/// letters buried in a title, then the artist, the album and the file name. Ties
/// keep library order, so the list does not shuffle between keystrokes.
/// </summary>
internal static class Search
{
    private static readonly char[] Gap = [' '];

    /// <summary>Accents, case and punctuation aside: "Sigur Rós" and "sigur ros" agree.</summary>
    private static string Canonical(string value) => LyricsClient.Canonical(value);

    /// <summary>Every word of the query starting a word of the text.</summary>
    private static bool EveryWordStarts(string text, string[] words) =>
        words.Length > 0 && words.All(part => text.Split(Gap, StringSplitOptions.RemoveEmptyEntries).Any(word => word.StartsWith(part, StringComparison.Ordinal)));

    /// <summary>How well one song answers one query; <c>null</c> when it does not answer at all.</summary>
    private static int? Rank(Song song, string[] words, string needle)
    {
        var title = Canonical(song.Title);
        var artist = Canonical(song.Artist);
        var album = Canonical(song.Album);
        var file = Canonical(Path.GetFileNameWithoutExtension(song.FileName));
        if (!words.All(word => (title + " " + artist + " " + album + " " + file).Contains(word))) return null;
        if (title == needle) return 0;
        if (title.StartsWith(needle, StringComparison.Ordinal)) return 1;
        if (EveryWordStarts(title, words)) return 2;
        if (title.Contains(needle, StringComparison.Ordinal)) return 3;
        if (EveryWordStarts(artist, words)) return 4;
        if (artist.Contains(needle, StringComparison.Ordinal)) return 4;
        if (EveryWordStarts(album, words)) return 5;
        if (album.Contains(needle, StringComparison.Ordinal)) return 5;
        return 6;
    }

    /// <summary>The songs that answer, the closest first. An empty query keeps the order it was given.</summary>
    internal static List<Song> Songs(IEnumerable<Song> songs, string query)
    {
        var needle = Canonical(query);
        if (needle.Length == 0) return songs.ToList();
        var words = needle.Split(Gap, StringSplitOptions.RemoveEmptyEntries);
        return songs
            .Select((song, index) => (song, index, rank: Rank(song, words, needle)))
            .Where(entry => entry.rank != null)
            .OrderBy(entry => entry.rank)
            .ThenBy(entry => entry.index)
            .Select(entry => entry.song)
            .ToList();
    }

    /// <summary>
    /// The same ladder for names that have no ranking of their own: artists,
    /// albums and playlists. The name you typed comes first, then a name that
    /// starts with it, then one with that word in it, then any that merely holds
    /// the letters; a shorter name wins a tie, because *Night* answers "night"
    /// more closely than *Nightcall (Deluxe)*.
    /// </summary>
    internal static List<T> Names<T>(IEnumerable<T> items, string query, Func<T, string> nameOf, Func<T, string>? detailOf = null)
    {
        var needle = Canonical(query);
        var all = items.ToList();
        if (needle.Length == 0) return all;
        var words = needle.Split(Gap, StringSplitOptions.RemoveEmptyEntries);
        return all
            .Select((item, index) => (item, index, name: Canonical(nameOf(item)), detail: Canonical(detailOf?.Invoke(item) ?? "")))
            .Where(entry => words.All(word => (entry.name + " " + entry.detail).Contains(word, StringComparison.Ordinal)))
            .Select(entry => (entry.item, entry.name, entry.index, weight:
                entry.name == needle ? 0 :
                entry.name.StartsWith(needle, StringComparison.Ordinal) ? 1 :
                entry.name.Split(Gap, StringSplitOptions.RemoveEmptyEntries).Any(word => word.StartsWith(needle, StringComparison.Ordinal)) ? 2 :
                entry.name.Contains(needle, StringComparison.Ordinal) ? 3 : 4))
            .OrderBy(entry => entry.weight)
            .ThenBy(entry => entry.name.Length)
            .ThenBy(entry => entry.index)
            .Select(entry => entry.item)
            .ToList();
    }
}
