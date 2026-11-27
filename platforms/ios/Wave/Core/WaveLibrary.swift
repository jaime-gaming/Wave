import Foundation






public struct AlbumGroup: Identifiable, Sendable {
    public let id: String
    public let title: String
    public let artist: String
    public let songs: [Song]

    public init(title: String, artist: String, songs: [Song]) {
        self.id = "\(artist.utf8.count):\(artist)\(title)"
        self.title = title
        self.artist = artist
        self.songs = songs
    }
}

public enum WaveLibrary {
    public enum SortOrder: String, Sendable {
        case title
        case artist
        case album
        case added
    }



    public static func normalized(_ text: String) -> String {
        let folded = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        return folded.lowercased()
    }



    public static func youtubeVideoID(from text: String) -> String? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = components.host?.lowercased(),
              components.user == nil, components.password == nil else { return nil }
        let parts = components.path.split(separator: "/").map(String.init)
        let id: String?
        switch host {
        case "youtu.be", "www.youtu.be":
            id = parts.count == 1 ? parts[0] : nil
        case "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com":
            if components.path == "/watch" {
                id = components.queryItems?.first(where: { $0.name == "v" })?.value
            } else if parts.count == 2 && ["embed", "shorts", "live"].contains(parts[0]) {
                id = parts[1]
            } else {
                id = nil
            }
        default:
            id = nil
        }
        guard let id, id.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { return nil }
        return id
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

    public static func albumGroups(in songs: [Song]) -> [AlbumGroup] {
        struct Key: Hashable { let artist: String; let album: String }
        let groups = Dictionary(grouping: songs) { Key(artist: $0.artist, album: $0.album) }
        return groups.map { key, songs in
            AlbumGroup(title: key.album, artist: key.artist, songs: sorted(songs, by: .title))
        }.sorted { first, second in
            let titleOrder = normalized(first.title).localizedCompare(normalized(second.title))
            if titleOrder != .orderedSame { return titleOrder == .orderedAscending }
            let artistOrder = normalized(first.artist).localizedCompare(normalized(second.artist))
            return artistOrder == .orderedSame ? first.id < second.id : artistOrder == .orderedAscending
        }
    }

    public static func songs(in playlist: Playlist, from songs: [Song]) -> [Song] {
        let byID = Dictionary(uniqueKeysWithValues: songs.map { ($0.id, $0) })
        return playlist.songIDs.compactMap { byID[$0] }
    }


    public static func pruned(_ playlists: [Playlist], songs: [Song]) -> [Playlist] {
        let ids = Set(songs.map(\.id))
        return playlists.map { playlist in
            var copy = playlist
            copy.songIDs = playlist.songIDs.filter { ids.contains($0) }
            return copy
        }
    }



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
            let target = min(pool.count, 14 + Int(rank("size-\(mixes.count)") % 7))
            while mix.count < target && !pool.isEmpty {
                let recent = Set(mix.suffix(4).map { normalized($0.artist) })
                let index = pool.firstIndex { !recent.contains(normalized($0.artist)) } ?? 0
                mix.append(pool.remove(at: index))
            }
            mixes.append(mix)
        }
        return mixes
    }



    public static func selectionQueue(_ ids: [String], startingAt selectedID: String, shuffle: Bool) -> [String] {
        guard ids.contains(selectedID) else { return [] }
        return shuffle ? [selectedID] + ids.filter { $0 != selectedID }.shuffled() : ids
    }


    public static func autoplayCandidates(
        from songs: [Song],
        excluding recent: [String],
        limit: Int = 5,
        currentID: String? = nil
    ) -> [Song] {
        let history = Array(recent.suffix(32))
        let excluded = Set(history)
        let all = songs.filter { $0.id != currentID }
        let fresh = all.filter { !excluded.contains($0.id) }
        if !fresh.isEmpty { return Array(fresh.shuffled().prefix(max(0, limit))) }
        guard currentID != nil else { return [] }
        // Recycle older songs first when the whole library has been heard.
        let oldest = all.sorted { (history.lastIndex(of: $0.id) ?? -1) < (history.lastIndex(of: $1.id) ?? -1) }
        return Array(oldest.prefix(max(0, min(limit, max(1, (oldest.count + 1) / 2)))))
    }
}
