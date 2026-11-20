import Foundation

/// One song the listener owns.
///
/// The audio file itself lives in the app's Documents/Music folder; this record
/// only describes it. Nothing is uploaded, converted or rewritten, exactly as
/// on the web, Windows and Android clients.
public struct Song: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var artist: String
    public var album: String
    public var duration: TimeInterval
    /// Relative to Documents/Music, so a backup or restore keeps working.
    public var fileName: String
    public var artworkName: String?
    public var lyrics: String?
    public var isFavorite: Bool
    /// Optional musical pulse, read from tags or estimated locally.
    public var bpm: Double?
    public var barOffset: TimeInterval?
    public var addedAt: Date

    public init(
        id: String = UUID().uuidString,
        title: String,
        artist: String = "Unknown artist",
        album: String = "",
        duration: TimeInterval = 0,
        fileName: String,
        artworkName: String? = nil,
        lyrics: String? = nil,
        isFavorite: Bool = false,
        bpm: Double? = nil,
        barOffset: TimeInterval? = nil,
        addedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.artist = artist
        self.album = album
        self.duration = duration
        self.fileName = fileName
        self.artworkName = artworkName
        self.lyrics = lyrics
        self.isFavorite = isFavorite
        self.bpm = bpm
        self.barOffset = barOffset
        self.addedAt = addedAt
    }
}

public struct Playlist: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var songIDs: [String]
    public var createdAt: Date

    public init(id: String = UUID().uuidString, name: String, songIDs: [String] = [], createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.songIDs = songIDs
        self.createdAt = createdAt
    }
}

public struct HistoryEntry: Codable, Hashable, Sendable {
    public var songID: String
    public var playedAt: Date
    public var completed: Bool

    public init(songID: String, playedAt: Date = Date(), completed: Bool = false) {
        self.songID = songID
        self.playedAt = playedAt
        self.completed = completed
    }
}

/// The three atomically written files the app keeps in its own Documents folder.
public struct LibrarySnapshot: Codable, Sendable {
    public var songs: [Song]
    public var playlists: [Playlist]
    public var history: [HistoryEntry]

    public init(songs: [Song] = [], playlists: [Playlist] = [], history: [HistoryEntry] = []) {
        self.songs = songs
        self.playlists = playlists
        self.history = history
    }

    public static let empty = LibrarySnapshot()
}
