import Foundation
import SwiftUI
import UIKit
import WaveCore

enum RepeatMode: String, CaseIterable, Sendable {
    case off
    case all
    case one
}

/// The one object the SwiftUI views talk to.
///
/// It keeps the library, the queue and the transport together, but all rules
/// live in `Wave/Core`: search, sorting, LRC parsing, Mix planning and the
/// automatic performance profile are pure and testable on a Mac without a
/// simulator. Nothing here uploads a file or a lyric.
@MainActor
final class WaveState: ObservableObject {
    @Published private(set) var snapshot: LibrarySnapshot = .empty
    @Published var queue: [String] = []
    @Published var currentID: String?
    @Published var currentTime: TimeInterval = 0
    @Published var isPlaying = false
    @Published var mixEnabled = true {
        didSet { armMix() }
    }
    @Published var shuffle = false {
        didSet { rebuildQueueAroundCurrent() }
    }
    @Published var repeatMode: RepeatMode = .off
    @Published var playerExpanded = false
    @Published var selectedTab = 0
    @Published private(set) var profile: DeviceProfile = .full

    private struct PendingMix {
        let id: String
        let plan: MixPlan
    }

    private var pendingMix: PendingMix?
    private var isCaptureSession = false
    private let persistence = LibraryPersistence()
    private let nowPlaying = NowPlayingCenter()
    private let system = WaveSystemCenter()
    let player = AudioPlayer()

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

    // MARK: - Library

    func importFiles(_ urls: [URL]) {
        let added = persistence.importFiles(urls)
        guard !added.isEmpty else { return }
        var next = snapshot
        next.songs = WaveLibrary.deduplicated(next.songs + added)
        snapshot = next
        persist()
        rebuildQueueAroundCurrent()
    }

    /// The listener's own LRC or plain-text file is kept beside the song in the
    /// library. It is read locally and never looked up or uploaded.
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

    /// Explicit, on-demand LRCLIB search. Only title and artist are sent; the
    /// response is bounded, matched to the selected track and stored locally.
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
        guard !lyric.isEmpty, lyric.count <= 100_000,
              let index = snapshot.songs.firstIndex(where: { $0.id == song.id }) else { return false }
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

    /// Apply a catalogue result only after the listener selects it. Audio bytes,
    /// duration, artwork and playback position are never rewritten.
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

    func createPlaylist(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        snapshot.playlists.append(Playlist(name: trimmed))
        persist()
    }

    func addToPlaylist(_ playlistID: String, songID: String) {
        guard let index = snapshot.playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        if !snapshot.playlists[index].songIDs.contains(songID) {
            snapshot.playlists[index].songIDs.append(songID)
            persist()
        }
    }

    func enqueue(_ song: Song) {
        queue.append(song.id)
        armMix()
    }

    func removeFromQueue(at offsets: IndexSet) {
        queue.remove(atOffsets: offsets)
        armMix()
    }

    // MARK: - Transport

    func play(_ song: Song) {
        let shouldRebuild = queue.isEmpty || !queue.contains(song.id) || (shuffle && queue.first != song.id)
        queue = shouldRebuild ? buildQueue(around: song.id) : queue
        currentID = song.id
        currentTime = 0
        player.play(url: persistence.url(for: song))
        isPlaying = true
        record(song)
        armMix()
        updateNowPlaying()
    }

    func playSelection(_ songs: [Song]) {
        guard let first = songs.first else { return }
        queue = songs.map(\.id)
        play(first)
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
            isPlaying = true
        }
        updateNowPlaying()
    }

    private func resumeFromRemote() {
        player.resume()
        isPlaying = true
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
        // A manual Next is a Mix; a natural end normally started one earlier,
        // on the outgoing instrumental downbeat.
        if mixEnabled && !automatic, let outgoing = current {
            let plan = makePlan(from: outgoing, to: nextSong)
            player.startMix(nextURL: persistence.url(for: nextSong), nextID: nextSong.id, plan: plan)
            isPlaying = true
            record(nextSong)
            updateNowPlaying()
        } else {
            self.currentID = nextSong.id
            currentTime = 0
            player.play(url: persistence.url(for: nextSong))
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
        self.currentID = song.id
        currentTime = 0
        player.play(url: persistence.url(for: song))
        isPlaying = true
        armMix()
        updateNowPlaying()
    }

    func seek(_ seconds: TimeInterval) {
        player.seek(seconds)
        currentTime = seconds
        armMix()
        updateNowPlaying()
    }

    func setVolume(_ value: Float) {
        player.volume = max(0, min(1, value))
    }

    private func advanceAutomatically() {
        if repeatMode == .one, let song = current {
            play(song)
            return
        }
        next(automatic: true)
    }

    private func finishQueue() {
        if repeatMode == .all, let first = song(with: queue.first ?? "") {
            play(first)
        } else {
            let candidates = WaveLibrary.autoplayCandidates(
                from: songs,
                excluding: Array(queue.suffix(5)),
                limit: 5
            )
            queue = candidates.map(\.id)
            if let first = candidates.first { play(first) }
            else {
                isPlaying = false
                updateNowPlaying()
            }
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

    /// Arm the next handover as soon as a song starts. The clock starts it at
    /// the plan's exact `startAt`, so an instrumental ending and beginning meet
    /// on their own downbeats rather than after an awkward silence.
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
        pendingMix = nil
        player.startMix(nextURL: persistence.url(for: incoming), nextID: incoming.id, plan: pending.plan)
        isPlaying = true
        record(incoming)
        updateNowPlaying()
    }

    /// Local only: tempo tags when they exist, the listener's own LRC timings
    /// for the instrumental edges, and no cloud call of any kind.
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

    /// Seeds an in-memory demo library for the native CI captures. The app's
    /// own SwiftUI views render it; no PNG is drawn, mocked up or retouched,
    /// and nothing is written to the listener's Documents folder.
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

    // MARK: - Remix and system actions

    func playRemix() {
        let recap = WaveRecap.summarize(songs: songs, history: snapshot.history, period: .weekly)
        guard let first = recap.songs.first else { return }
        selectedTab = 3
        queue = recap.songs.map(\.id)
        play(first)
    }

    func saveRemix() {
        let recap = WaveRecap.summarize(songs: songs, history: snapshot.history, period: .weekly)
        guard !recap.songs.isEmpty else { return }
        createPlaylist(name: WaveTheme.loc("Your Remix"))
        guard let playlist = snapshot.playlists.last else { return }
        for song in recap.songs {
            addToPlaylist(playlist.id, songID: song.id)
        }
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
