import Foundation

/// Pure library rules for the iPhone and iPad app.
///
/// Search, sorting and duplicate handling are deliberately independent of
/// SwiftUI, AVFoundation and the file system, so the same contracts can be
/// exercised by `swift test` on any Mac and by the Xcode test target.
public enum WaveLibrary {
    public enum SortOrder: String, Sendable {
        case title
        case artist
        case album
        case added
    }

    /// Forgiving comparison: case, accents and a little punctuation do not
    /// decide whether a song answers a search.
    public static func normalized(_ text: String) -> String {
        let folded = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        return folded.lowercased()
    }

    public static func matches(_ song: Song, query: String) -> Bool {
        let needle = normalized(query.trimmingCharacters(in: .whitespacesAndNewlines))
        if needle.isEmpty { return true }
        let haystack = normalized("\(song.title) \(song.artist) \(song.album)")
        return haystack.contains(needle)
    }

    public static func search(_ songs: [Song], query: String) -> [Song] {
        songs.filter { matches($0, query: query) }
    }

    public static func sorted(_ songs: [Song], by order: SortOrder) -> [Song] {
        songs.sorted { left, right in
            switch order {
            case .title:
                return normalized(left.title).localizedCompare(normalized(right.title)) == .orderedAscending
            case .artist:
                let artists = normalized(left.artist).localizedCompare(normalized(right.artist))
                return artists == .orderedSame
                    ? normalized(left.title).localizedCompare(normalized(right.title)) == .orderedAscending
                    : artists == .orderedAscending
            case .album:
                let albums = normalized(left.album).localizedCompare(normalized(right.album))
                return albums == .orderedSame
                    ? normalized(left.title).localizedCompare(normalized(right.title)) == .orderedAscending
                    : albums == .orderedAscending
            case .added:
                return left.addedAt > right.addedAt
            }
        }
    }

    /// A song imported twice is one song. Only exact file names are merged:
    /// two recordings with the same title are left for the listener to decide.
    public static func deduplicated(_ songs: [Song]) -> [Song] {
        var seen = Set<String>()
        return songs.filter { seen.insert($0.fileName).inserted }
    }

    public static func artists(in songs: [Song]) -> [String] {
        Array(Set(songs.map { $0.artist }.filter { !$0.isEmpty })).sorted { normalized($0).localizedCompare(normalized($1)) == .orderedAscending }
    }

    public static func albums(in songs: [Song]) -> [String] {
        Array(Set(songs.map { $0.album }.filter { !$0.isEmpty })).sorted { normalized($0).localizedCompare(normalized($1)) == .orderedAscending }
    }

    public static func songs(in playlist: Playlist, from songs: [Song]) -> [Song] {
        let byID = Dictionary(uniqueKeysWithValues: songs.map { ($0.id, $0) })
        return playlist.songIDs.compactMap { byID[$0] }
    }

    /// Drops playlists that no longer exist instead of showing a broken row.
    public static func pruned(_ playlists: [Playlist], songs: [Song]) -> [Playlist] {
        let ids = Set(songs.map(\.id))
        return playlists.map { playlist in
            var copy = playlist
            copy.songIDs = playlist.songIDs.filter { ids.contains($0) }
            return copy
        }
    }

    /// A deterministic local daily selection. Complete mixes have 7–20 songs,
    /// at most three mixes, and try to separate consecutive artists.
    public static func dailyMixes(_ songs: [Song], day: Date = Date(), calendar: Calendar = .current) -> [[Song]] {
        guard songs.count >= 7 else { return [] }
        let date = calendar.dateComponents([.year, .month, .day], from: day)
        let seed = "\(date.year ?? 0)-\(date.month ?? 0)-\(date.day ?? 0)"
        func rank(_ id: String) -> UInt64 {
            (seed + id).utf8.reduce(UInt64(14695981039346656037)) { ($0 ^ UInt64($1)) &* 1099511628211 }
        }
        var pool = songs.sorted { a, b in
            let left = rank(a.id), right = rank(b.id)
            return left == right ? a.id < b.id : left < right
        }
        var mixes: [[Song]] = []
        while pool.count >= 7 && mixes.count < 3 {
            var mix: [Song] = []
            let target = min(20, pool.count)
            while mix.count < target && !pool.isEmpty {
                let recent = Set(mix.suffix(4).map { normalized($0.artist) })
                let index = pool.firstIndex { !recent.contains(normalized($0.artist)) } ?? 0
                mix.append(pool.remove(at: index))
            }
            mixes.append(mix)
        }
        return mixes
    }

    /// A collection stays the playback context. Shuffle changes only that
    /// collection, starting with the selected song, rather than the library.
    public static func selectionQueue(_ ids: [String], startingAt selectedID: String, shuffle: Bool) -> [String] {
        guard ids.contains(selectedID) else { return [] }
        return shuffle ? [selectedID] + ids.filter { $0 != selectedID }.shuffled() : ids
    }

    /// A bounded local AutoPlay queue: no repeats of the songs just heard.
    public static func autoplayCandidates(
        from songs: [Song],
        excluding recent: [String],
        limit: Int = 5
    ) -> [Song] {
        let excluded = Set(recent)
        return Array(songs.filter { !excluded.contains($0.id) }.shuffled().prefix(max(0, limit)))
    }
}
