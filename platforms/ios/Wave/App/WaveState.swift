import Foundation
import SwiftUI
import UIKit
import WaveCore

enum LibrarySection: Int, CaseIterable {
    case songs, albums, artists, playlists, favorites
}

enum RepeatMode: String, CaseIterable, Sendable {
    case off
    case all
    case one
}







@MainActor
final class WaveState: ObservableObject {
    @Published private(set) var snapshot: LibrarySnapshot = .empty
    @Published var queue: [String] = []
    @Published var currentID: String? { didSet { if currentID != oldValue { scheduleAutomaticLyrics() } } }
    @Published var automaticLyricsEnabled: Bool {
        didSet {
            if !isCaptureSession { defaults.set(automaticLyricsEnabled, forKey: "wave.automaticLyrics") }
            scheduleAutomaticLyrics()
        }
    }
    @Published var currentTime: TimeInterval = 0
    @Published var isPlaying = false
    @Published var playbackError: String?
    @Published var mixEnabled: Bool {
        didSet {
            if !isCaptureSession { defaults.set(mixEnabled, forKey: "wave.mixEnabled") }
            armMix()
        }
    }
    @Published var autoplayEnabled: Bool {
        didSet {
            if !isCaptureSession { defaults.set(autoplayEnabled, forKey: "wave.autoplayEnabled") }
        }
    }
    @Published var shuffle = false {
        didSet { rebuildQueueAroundCurrent() }
    }
    @Published var repeatMode: RepeatMode = .off
    @Published var playerExpanded = false
    @Published var selectedTab = 0
    @Published var librarySection: LibrarySection = .songs
    @Published var libraryNavigationID = UUID()
    @Published private(set) var profile: DeviceProfile = .full

    private struct PendingMix {
        let id: String
        let plan: MixPlan
    }

    private let defaults: UserDefaults
    private var pendingMix: PendingMix?
    private var automaticLyricsTask: Task<Void, Never>?
    private var automaticLyricsKey: String?
    private var automaticLyricsGeneration = 0
    private var automaticLyricsAttempts = Set<String>()
    private var isCaptureSession = false
    private let persistence = LibraryPersistence()
    private let nowPlaying = NowPlayingCenter()
    private let system = WaveSystemCenter()
    let player = AudioPlayer()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.mixEnabled = defaults.object(forKey: "wave.mixEnabled") as? Bool ?? true
        self.autoplayEnabled = defaults.object(forKey: "wave.autoplayEnabled") as? Bool ?? true
        self.automaticLyricsEnabled = defaults.bool(forKey: "wave.automaticLyrics")
    }

    func openLibrary(_ section: LibrarySection) {
        librarySection = section
        libraryNavigationID = UUID()
        selectedTab = 1
    }

    var songs: [Song] { snapshot.songs }
    var current: Song? { snapshot.songs.first { $0.id == currentID } }
    var duration: TimeInterval { current?.duration ?? 0 }
    var rowsPerPage: Int { WavePerformance.rowsPerPage(profile) }
    var ambientMotion: Bool { WavePerformance.allowsAmbientMotion(profile) }

    func start() {
        snapshot = persistence.load()
        profile = Self.detectProfile()

        player.onTick = { [weak self] time in
            guard let self else { return }
            self.currentTime = time
            self.startPendingMix(at: time)
            self.updateNowPlaying()
        }
        player.onFinished = { [weak self] in
            self?.advanceAutomatically()
        }
        player.onMixCompleted = { [weak self] id in
            self?.currentID = id
            self?.isPlaying = true
            self?.armMix()
            self?.updateNowPlaying()
        }

        nowPlaying.register(
            play: { [weak self] in Task { @MainActor in self?.resumeFromRemote() } },
            pause: { [weak self] in Task { @MainActor in self?.pauseFromRemote() } },
            next: { [weak self] in Task { @MainActor in self?.next() } },
            previous: { [weak self] in Task { @MainActor in self?.previous() } },
            seek: { [weak self] seconds in Task { @MainActor in self?.seek(seconds) } }
        )
        system.connect(state: self)
        #if targetEnvironment(simulator)
        if let page = ProcessInfo.processInfo.environment["WAVE_CAPTURE_PAGE"] {
            configureCapture(page: page)
        }
        #endif
    }

    private static func detectProfile() -> DeviceProfile {
        let info = ProcessInfo.processInfo
        return WavePerformance.profile(
            DeviceSignals(
                memoryGB: Double(info.physicalMemory) / 1_073_741_824,
                cores: info.processorCount,
                reducedMotion: UIAccessibility.isReduceMotionEnabled,
                lowPowerMode: info.isLowPowerModeEnabled,
                screenScale: Double(UIScreen.main.scale),
                smallScreen: UIScreen.main.bounds.width < 700
            )
        )
    }



    func importFiles(_ urls: [URL]) {
        let added = persistence.importFiles(urls)
        guard !added.isEmpty else { return }
        var next = snapshot
        next.songs = WaveLibrary.deduplicated(next.songs + added)
        snapshot = next
        persist()
        rebuildQueueAroundCurrent()
    }



    func importLyrics(from url: URL) {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        guard
            let raw = try? String(contentsOf: url, encoding: .utf8),
            !WaveLyrics.parse(raw).isEmpty || !WaveLyrics.plain(raw).isEmpty,
            let index = snapshot.songs.firstIndex(where: { $0.id == currentID })
        else { return }
        snapshot.songs[index].lyrics = raw
        persist()
        armMix()
    }



    private func scheduleAutomaticLyrics() {
        automaticLyricsGeneration += 1
        automaticLyricsTask?.cancel()
        if let key = automaticLyricsKey { automaticLyricsAttempts.remove(key) }
        automaticLyricsTask = nil
        automaticLyricsKey = nil
        guard automaticLyricsEnabled, !isCaptureSession, let song = current,
              (song.lyrics ?? "").isEmpty, !song.title.isEmpty, !song.artist.isEmpty else { return }
        let key = "\(song.id)\u{1f}\(song.title)\u{1f}\(song.artist)"
        guard !automaticLyricsAttempts.contains(key) else { return }
        automaticLyricsAttempts.insert(key)
        automaticLyricsKey = key
        let generation = automaticLyricsGeneration
        automaticLyricsTask = Task { [weak self] in
            guard let self else { return }
            do { _ = try await self.findLyrics(for: song) } catch { }
            if self.automaticLyricsGeneration == generation { self.automaticLyricsKey = nil }
        }
    }

    func findLyrics(for song: Song) async throws -> Bool {
        struct Result: Decodable {
            let trackName: String
            let artistName: String
            let duration: Double?
            let syncedLyrics: String?
            let plainLyrics: String?
        }
        var components = URLComponents(string: "https://lrclib.net/api/search")!
        components.queryItems = [
            URLQueryItem(name: "track_name", value: song.title),
            URLQueryItem(name: "artist_name", value: song.artist),
        ]
        guard let url = components.url else { return false }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("Wave/0.3.0 (https://github.com/jaime-gaming/Wave)", forHTTPHeaderField: "User-Agent")
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
        var data = Data()
        for try await byte in bytes {
            guard data.count < 600_000 else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        let results = try JSONDecoder().decode([Result].self, from: data)
        guard let match = results.prefix(20).first(where: { result in
            WaveLibrary.normalized(result.trackName) == WaveLibrary.normalized(song.title) &&
            WaveLibrary.normalized(result.artistName) == WaveLibrary.normalized(song.artist) &&
            (song.duration <= 0 || result.duration == nil || abs((result.duration ?? 0) - song.duration) <= 3)
        }) else { return false }
        let lyric = (match.syncedLyrics?.isEmpty == false ? match.syncedLyrics : match.plainLyrics) ?? ""
        guard !Task.isCancelled, !lyric.isEmpty, lyric.count <= 100_000,
              let index = snapshot.songs.firstIndex(where: { $0.id == song.id }),
              snapshot.songs[index].title == song.title,
              snapshot.songs[index].artist == song.artist,
              snapshot.songs[index].lyrics == song.lyrics else { return false }
        snapshot.songs[index].lyrics = lyric
        persist()
        if currentID == song.id { armMix() }
        return true
    }

    func persist() {
        guard !isCaptureSession else { return }
        persistence.save(snapshot)
        system.reloadWidgets()
    }

    func song(with id: String) -> Song? {
        snapshot.songs.first { $0.id == id }
    }

    func artwork(for song: Song) -> UIImage? {
        guard let name = song.artworkName else { return nil }
        return UIImage(contentsOfFile: persistence.artworkURL(named: name).path)
    }



    func applyCatalogue(songID: String, title: String, artist: String, album: String) {
        guard let index = snapshot.songs.firstIndex(where: { $0.id == songID }) else { return }
        snapshot.songs[index].title = title
        snapshot.songs[index].artist = artist
        snapshot.songs[index].album = album
        persist()
        if currentID == songID { updateNowPlaying() }
    }

    func toggleFavorite(_ song: Song) {
        guard let index = snapshot.songs.firstIndex(where: { $0.id == song.id }) else { return }
        snapshot.songs[index].isFavorite.toggle()
        persist()
    }


    func saveDailyMix(_ songs: [Song], name: String) {
        let available = Set(snapshot.songs.map(\.id))
        let ids = songs.map(\.id).filter { available.contains($0) }
        guard !ids.isEmpty else { return }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "dd/MM/yyyy"
        let day = formatter.string(from: Date())
        func mixName(_ index: Int) -> String {
            if index == 1 { return "\(day)'s Daily Mix" }
            let suffix = (11...13).contains(index % 100) ? "th" : (index % 10 == 1 ? "st" : index % 10 == 2 ? "nd" : index % 10 == 3 ? "rd" : "th")
            return "\(day)'s \(index)\(suffix) Daily Mix"
        }
        let existing = Set(snapshot.playlists.map { $0.name.lowercased() })
        var index = 1
        while existing.contains(mixName(index).lowercased()) { index += 1 }
        snapshot.playlists.append(Playlist(name: mixName(index), songIDs: ids))
        persist()
    }

    func createPlaylist(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        snapshot.playlists.append(Playlist(name: trimmed))
        persist()
    }

    func addToPlaylist(_ playlistID: String, songID: String) {
        guard song(with: songID) != nil,
              let index = snapshot.playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        if !snapshot.playlists[index].songIDs.contains(songID) {
            snapshot.playlists[index].songIDs.append(songID)
            persist()
        }
    }

    func removeFromPlaylist(_ playlistID: String, at offsets: IndexSet) {
        guard let index = snapshot.playlists.firstIndex(where: { $0.id == playlistID }),
              offsets.allSatisfy({ snapshot.playlists[index].songIDs.indices.contains($0) }) else { return }
        snapshot.playlists[index].songIDs.remove(atOffsets: offsets)
        persist()
    }

    func moveInPlaylist(_ playlistID: String, from offsets: IndexSet, to destination: Int) {
        guard let index = snapshot.playlists.firstIndex(where: { $0.id == playlistID }),
              offsets.allSatisfy({ snapshot.playlists[index].songIDs.indices.contains($0) }),
              (0...snapshot.playlists[index].songIDs.count).contains(destination) else { return }
        snapshot.playlists[index].songIDs.move(fromOffsets: offsets, toOffset: destination)
        persist()
    }

    func deletePlaylist(_ playlistID: String) {
        snapshot.playlists.removeAll { $0.id == playlistID }
        persist()
    }

    func enqueue(_ song: Song) {
        queue.append(song.id)
        armMix()
    }

    func removeFromQueue(at offsets: IndexSet) {
        guard player.mixProgress == nil,
              offsets.allSatisfy({ queue.indices.contains($0) && queue[$0] != currentID }) else { return }
        queue.remove(atOffsets: offsets)
        armMix()
    }

    func moveInQueue(from offsets: IndexSet, to destination: Int) {

        guard player.mixProgress == nil,
              offsets.allSatisfy({ queue.indices.contains($0) }),
              (0...queue.count).contains(destination) else { return }
        queue.move(fromOffsets: offsets, toOffset: destination)
        armMix()
    }



    func play(_ song: Song) {
        let shouldRebuild = queue.isEmpty || !queue.contains(song.id) || (shuffle && queue.first != song.id)
        let nextQueue = shouldRebuild ? buildQueue(around: song.id) : queue
        guard player.play(url: persistence.url(for: song)) else {
            playbackError = WaveTheme.loc("This song could not be played.")
            return
        }
        playbackError = nil
        queue = nextQueue
        currentID = song.id
        currentTime = 0
        isPlaying = true
        record(song)
        armMix()
        updateNowPlaying()
    }

    func playSelection(_ songs: [Song], startingAt selected: Song? = nil) {
        guard let first = selected ?? songs.first, songs.contains(where: { $0.id == first.id }) else { return }
        let oldQueue = queue
        queue = WaveLibrary.selectionQueue(songs.map(\.id), startingAt: first.id, shuffle: shuffle)
        play(first)
        if playbackError != nil { queue = oldQueue; armMix() }
    }

    func togglePlayPause() {
        if currentID == nil, let first = WaveLibrary.sorted(songs, by: .added).first {
            play(first)
            return
        }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            player.resume()
            isPlaying = player.isPlaying
        }
        updateNowPlaying()
    }

    private func resumeFromRemote() {
        player.resume()
        isPlaying = player.isPlaying
        updateNowPlaying()
    }

    private func pauseFromRemote() {
        player.pause()
        isPlaying = false
        updateNowPlaying()
    }

    func next(automatic: Bool = false) {
        guard let currentID, let index = queue.firstIndex(of: currentID) else {
            if let first = WaveLibrary.sorted(songs, by: .added).first { play(first) }
            return
        }
        let following = index + 1
        guard following < queue.count, let nextSong = song(with: queue[following]) else {
            finishQueue()
            return
        }
        pendingMix = nil


        if mixEnabled && !automatic, let outgoing = current {
            let plan = makePlan(from: outgoing, to: nextSong)
            guard player.startMix(nextURL: persistence.url(for: nextSong), nextID: nextSong.id, plan: plan) else {
                playbackError = WaveTheme.loc("This song could not be played.")
                armMix()
                return
            }
            playbackError = nil
            isPlaying = player.isPlaying
            record(nextSong)
            updateNowPlaying()
        } else {
            guard player.play(url: persistence.url(for: nextSong)) else {
                playbackError = WaveTheme.loc("This song could not be played.")
                if automatic {
                    player.pause()
                    isPlaying = false
                    updateNowPlaying()
                } else { armMix() }
                return
            }
            playbackError = nil
            self.currentID = nextSong.id
            currentTime = 0
            isPlaying = true
            record(nextSong)
            armMix()
            updateNowPlaying()
        }
    }

    func previous() {
        if currentTime > 3 {
            seek(0)
            return
        }
        guard let currentID, let index = queue.firstIndex(of: currentID), index > 0,
              let song = song(with: queue[index - 1])
        else {
            seek(0)
            return
        }
        guard player.play(url: persistence.url(for: song)) else {
            playbackError = WaveTheme.loc("This song could not be played.")
            return
        }
        playbackError = nil
        self.currentID = song.id
        currentTime = 0
        isPlaying = true
        armMix()
        updateNowPlaying()
    }

    func seek(_ seconds: TimeInterval) {
        guard seconds.isFinite else { return }
        player.seek(seconds)
        currentTime = player.time
        armMix()
        updateNowPlaying()
    }

    func setVolume(_ value: Float) {
        player.volume = max(0, min(1, value))
    }

    private func advanceAutomatically() {
        if repeatMode == .one, let song = current {
            play(song)
            if playbackError != nil { player.pause(); isPlaying = false; updateNowPlaying() }
            return
        }
        next(automatic: true)
    }

    private func finishQueue() {
        if repeatMode == .all, let first = song(with: queue.first ?? "") {
            play(first)
            if playbackError != nil { player.pause(); isPlaying = false; updateNowPlaying() }
        } else if autoplayEnabled {
            let candidates = WaveLibrary.autoplayCandidates(
                from: songs,
                excluding: Array(snapshot.history.suffix(32).map(\.songID)),
                limit: 5,
                currentID: currentID
            )
            if let first = candidates.first {
                playSelection(candidates, startingAt: first)
                if playbackError != nil { player.pause(); isPlaying = false; updateNowPlaying() }
            } else {
                player.pause()
                isPlaying = false
                updateNowPlaying()
            }
        } else {
            player.pause()
            isPlaying = false
            updateNowPlaying()
        }
    }

    private func buildQueue(around songID: String) -> [String] {
        var ids = WaveLibrary.sorted(songs, by: .title).map(\.id)
        if shuffle { ids.shuffle() }
        if let index = ids.firstIndex(of: songID) { ids.remove(at: index) }
        return [songID] + ids
    }

    private func rebuildQueueAroundCurrent() {
        guard let currentID else { return }
        queue = buildQueue(around: currentID)
        armMix()
    }




    private func armMix() {
        pendingMix = nil
        guard
            mixEnabled,
            let currentID,
            let outgoing = current,
            let index = queue.firstIndex(of: currentID),
            index + 1 < queue.count,
            let incoming = song(with: queue[index + 1])
        else { return }
        let plan = makePlan(from: outgoing, to: incoming)
        guard plan.mode != .cut else { return }
        pendingMix = PendingMix(id: incoming.id, plan: plan)
    }

    private func startPendingMix(at time: TimeInterval) {
        guard
            let pending = pendingMix,
            player.mixProgress == nil,
            time >= pending.plan.startAt,
            let incoming = song(with: pending.id)
        else { return }
        let remaining = max(0, (current?.duration ?? 0) - time)
        let window = min(pending.plan.overlap, incoming.duration)
        guard remaining > 0, remaining <= window else { return }
        let safePlan = MixPlan(mode: pending.plan.mode, overlap: remaining, startAt: time,
                               cue: 0, bars: 0, pulseAligned: false,
                               reason: pending.plan.reason, ending: pending.plan.ending)
        pendingMix = nil
        guard player.startMix(nextURL: persistence.url(for: incoming), nextID: incoming.id, plan: safePlan) else { return }
        isPlaying = true
        record(incoming)
        updateNowPlaying()
    }



    private func makePlan(from outgoing: Song, to incoming: Song) -> MixPlan {
        let a = MixTrack(
            duration: outgoing.duration,
            bpm: outgoing.bpm,
            barOffset: outgoing.bpm == nil ? nil : (outgoing.barOffset ?? 0),
            lyrics: WaveLyrics.parse(outgoing.lyrics ?? "")
        )
        let b = MixTrack(
            duration: incoming.duration,
            bpm: incoming.bpm,
            barOffset: incoming.bpm == nil ? nil : (incoming.barOffset ?? 0),
            lyrics: WaveLyrics.parse(incoming.lyrics ?? "")
        )
        return WaveMix.plan(outgoing: a, incoming: b)
    }

    private func record(_ song: Song) {
        var next = snapshot
        next.history.append(HistoryEntry(songID: song.id))
        if next.history.count > 366 * 4 { next.history.removeFirst(next.history.count - 366 * 4) }
        snapshot = next
        persist()
    }

    private func updateNowPlaying() {
        let art = current.flatMap { artwork(for: $0) }
        nowPlaying.update(song: current, time: currentTime, playing: isPlaying, artwork: art)
        system.update(song: current, time: currentTime, playing: isPlaying)
    }




    func configureCapture(page: String) {
        #if !targetEnvironment(simulator)
        return
        #endif
        isCaptureSession = true
        let now = Date()
        let names = [
            ("Signal", "Wave", "First light"),
            ("Amber", "Norte", "Luz"),
            ("Coastal Line", "Marea", "Northbound"),
            ("Afterglow", "Wave", "First light"),
            ("Slow Motion", "Norte", "Luz"),
            ("Night Drive", "Marea", "Northbound"),
            ("Paper Moon", "Wave", "First light"),
            ("Blue Hour", "Norte", "Luz"),
        ]
        let songs = names.enumerated().map { index, item in
            Song(
                id: "capture-\(index)",
                title: item.0,
                artist: item.1,
                album: item.2,
                duration: 186 + Double(index) * 7,
                fileName: "capture-\(index).wav",
                lyrics: "[00:12.00]First line\n[01:24.00]Second line",
                isFavorite: index == 1 || index == 4,
                bpm: 120,
                barOffset: 0.05,
                addedAt: now.addingTimeInterval(Double(index) * -3600)
            )
        }
        let history = songs.enumerated().flatMap { index, song in
            (0..<(index + 1)).map { play in
                HistoryEntry(
                    songID: song.id,
                    playedAt: now.addingTimeInterval(Double(-play * 5400 - index * 60)),
                    completed: true
                )
            }
        }
        snapshot = LibrarySnapshot(
            songs: songs,
            playlists: [Playlist(name: "Morning collection", songIDs: songs.prefix(4).map(\.id))],
            history: history
        )
        queue = songs.map(\.id)
        currentID = songs.first?.id
        currentTime = 82
        isPlaying = true
        mixEnabled = true
        profile = .full
        pendingMix = nil
        selectedTab = page == "library" ? 1 : page == "search" ? 2 : page == "remix" ? 3 : page == "settings" ? 4 : 0
        playerExpanded = page == "now-playing"
    }



    func playRemix(period: RemixPeriod = .weekly) {
        let recap = WaveRecap.summarize(songs: songs, history: snapshot.history, period: period)
        guard let first = recap.songs.first else { return }
        selectedTab = 3
        queue = recap.songs.map(\.id)
        play(first)
    }

    func saveRemix(period: RemixPeriod = .weekly) {
        let recap = WaveRecap.summarize(songs: songs, history: snapshot.history, period: period)
        guard !recap.songs.isEmpty else { return }
        snapshot.playlists.append(Playlist(name: WaveTheme.loc("Your Remix"), songIDs: recap.songs.map(\.id)))
        persist()
    }

    func openHomeFromSystem() { selectedTab = 0 }
    func openSearchFromSystem() { selectedTab = 2 }
    func openRemixFromSystem() { selectedTab = 3 }
    func resumeFromSystem() { resumeFromRemote() }
    func pauseFromSystem() { pauseFromRemote() }
    func toggleFromSystem() { togglePlayPause() }
    func nextFromSystem() { next() }
    func playRemixFromSystem() { playRemix() }

    func playFavoritesFromSystem() {
        let favorites = WaveLibrary.sorted(songs.filter(\.isFavorite), by: .title)
        guard let first = favorites.first else { return }
        selectedTab = 0
        queue = favorites.map(\.id)
        play(first)
    }
}
