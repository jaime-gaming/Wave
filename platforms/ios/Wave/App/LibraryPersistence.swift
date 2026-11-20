import Foundation
import WaveCore

/// The library is three atomically written JSON files in the app's own
/// Documents folder, plus the imported audio and its extracted artwork.
///
/// A single corrupt file never breaks the whole library: each one is decoded
/// independently and a missing one simply starts empty. Original files are
/// copied in, never converted, and a failed copy leaves the library unchanged.
final class LibraryPersistence {
    private let manager = FileManager.default
    private let documents: URL
    private let music: URL
    private let artwork: URL
    private let libraryURL: URL
    private let playlistsURL: URL
    private let historyURL: URL

    private let encoder: JSONEncoder = {
        let value = JSONEncoder()
        value.outputFormatting = [.prettyPrinted, .sortedKeys]
        value.dateEncodingStrategy = .iso8601
        return value
    }()

    private let decoder: JSONDecoder = {
        let value = JSONDecoder()
        value.dateDecodingStrategy = .iso8601
        return value
    }()

    init() {
        documents = manager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        music = documents.appendingPathComponent("Music", isDirectory: true)
        artwork = documents.appendingPathComponent("Artwork", isDirectory: true)
        libraryURL = documents.appendingPathComponent("library.json")
        playlistsURL = documents.appendingPathComponent("playlists.json")
        historyURL = documents.appendingPathComponent("history.json")
        for folder in [music, artwork] {
            try? manager.createDirectory(at: folder, withIntermediateDirectories: true)
        }
    }

    func load() -> LibrarySnapshot {
        let songs = WaveLibrary.deduplicated(read([Song].self, libraryURL) ?? [])
        let playlists = WaveLibrary.pruned(read([Playlist].self, playlistsURL) ?? [], songs: songs)
        let history = read([HistoryEntry].self, historyURL) ?? []
        return LibrarySnapshot(songs: songs, playlists: playlists, history: history)
    }

    func save(_ snapshot: LibrarySnapshot) {
        write(snapshot.songs, to: libraryURL)
        write(snapshot.playlists, to: playlistsURL)
        write(snapshot.history, to: historyURL)
    }

    func url(for song: Song) -> URL {
        music.appendingPathComponent(song.fileName)
    }

    func artworkURL(named name: String) -> URL {
        artwork.appendingPathComponent(name)
    }

    /// Imports the files the listener picked in the document picker. Each file
    /// is independent: one unreadable file does not cancel the rest.
    func importFiles(_ urls: [URL]) -> [Song] {
        var imported: [Song] = []
        for source in urls {
            let accessing = source.startAccessingSecurityScopedResource()
            defer { if accessing { source.stopAccessingSecurityScopedResource() } }
            let ext = source.pathExtension.isEmpty ? "m4a" : source.pathExtension
            let storedName = "\(UUID().uuidString).\(ext)"
            let target = music.appendingPathComponent(storedName)
            do {
                try manager.copyItem(at: source, to: target)
            } catch {
                continue
            }
            let tags = MetadataReader.read(target)
            var song = Song(
                title: tags.title ?? MetadataReader.fallbackTitle(source.lastPathComponent),
                artist: tags.artist ?? WaveTheme.loc("Unknown artist"),
                album: tags.album ?? "",
                duration: tags.duration,
                fileName: storedName,
                bpm: tags.bpm
            )
            if let data = tags.artwork {
                let name = "\(UUID().uuidString).jpg"
                do {
                    try data.write(to: artworkURL(named: name), options: .atomic)
                    song.artworkName = name
                } catch {
                    // Artwork is optional; the song still plays.
                }
            }
            imported.append(song)
        }
        return imported
    }

    private func read<T: Decodable>(_ type: T.Type, _ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ value: T, to url: URL) {
        guard let data = try? encoder.encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
