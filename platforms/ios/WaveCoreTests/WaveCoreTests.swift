import Foundation
import XCTest
@testable import WaveCore

final class WaveLyricsTests: XCTestCase {
    func testParsesSyncedLinesAndWordMarkers() {
        let lrc = "[00:12.50]<00:12.50>First <00:13.00>line\n[01:02.25]Second line\n"
        let lines = WaveLyrics.parse(lrc)
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(lines[0].time, 12.5, accuracy: 0.001)
        XCTAssertEqual(lines[0].text, "First line")
        XCTAssertEqual(lines[1].time, 62.25, accuracy: 0.001)
    }

    func testEnhancedWordsOffsetsAndRepeatedLines() {
        let lines = WaveLyrics.parse("[offset:500]\n[00:12.50][00:30.50]<00:12.50>First <00:13.00>line")
        XCTAssertEqual(lines.map(\.time), [12, 30])
        XCTAssertEqual(lines[0].words.map(\.text).joined(), "First line")
        XCTAssertEqual(lines[0].words.map(\.time), [12, 12.5])
        XCTAssertEqual(lines[1].words.map(\.time), [30, 30.5])
        XCTAssertEqual(lines[0].words.first?.end, 12.5)
        XCTAssertTrue(WaveLyrics.parse("[00:12]<00:13>bad <00:12>order")[0].words.isEmpty)
    }

    func testBOMWithOffsetAndPlainMetadata() {
        let lines = WaveLyrics.parse("\u{FEFF}[offset:500]\n[00:02]<00:02>Hello")
        XCTAssertEqual(lines.first?.time, 1.5)
        XCTAssertEqual(lines.first?.text, "Hello")
        XCTAssertEqual(lines.first?.words.first?.time, 1.5)
        XCTAssertEqual(WaveLyrics.plain("\u{FEFF}[ar:Artist]\nHello"), ["Hello"])
    }

    func testPlainLyricsIgnoreMetadata() {
        XCTAssertEqual(WaveLyrics.plain("[ar:Artist]\nFirst\nSecond"), ["First", "Second"])
    }

    func testOffsetAndActiveLine() {
        let lines = WaveLyrics.parse("[00:10.00]A\n[00:20.00]B\n", offset: 2)
        XCTAssertEqual(lines.map(\.time), [12, 22])
        XCTAssertEqual(WaveLyrics.activeLine(lines, at: 9), nil)
        XCTAssertEqual(WaveLyrics.activeLine(lines, at: 21), 0)
        XCTAssertEqual(WaveLyrics.activeLine(lines, at: 30), 1)
    }

    func testSungBoundsMarkTheInstrumentalEdges() {
        let lines = WaveLyrics.parse("[00:36.00]A\n[03:30.00]B\n")
        let bounds = WaveLyrics.sungBounds(lines)
        XCTAssertEqual(bounds?.first, 36)
        XCTAssertEqual(bounds?.last, 210)
    }

    func testPlainLyricsAreStillReadable() {
        XCTAssertEqual(WaveLyrics.plain("One\n\nTwo\n"), ["One", "Two"])
        XCTAssertTrue(WaveLyrics.parse("One\nTwo\n").isEmpty)
        XCTAssertEqual(WaveLyrics.displayLines("One\nTwo\n").map(\.text), ["One", "Two"])
        XCTAssertNil(WaveLyrics.activeLine(WaveLyrics.displayLines("One\nTwo\n"), at: 30))
    }
}

final class WaveLibraryTests: XCTestCase {
    private let songs = [
        Song(title: "Ámbar", artist: "Norte", album: "Luz", fileName: "ambar.m4a", addedAt: Date(timeIntervalSince1970: 1)),
        Song(title: "Signal", artist: "Wave", album: "First light", fileName: "signal.mp3", addedAt: Date(timeIntervalSince1970: 2)),
        Song(title: "Signal", artist: "Wave", album: "First light", fileName: "signal.mp3", addedAt: Date(timeIntervalSince1970: 3))
    ]

    func testAccentAndCaseInsensitiveSearch() {
        XCTAssertEqual(WaveLibrary.search(songs, query: "ambar").count, 1)
        XCTAssertTrue(WaveLibrary.matches(songs[0], query: "AMBAR"))
        XCTAssertTrue(WaveLibrary.matches(songs[1], query: "first light"))
    }

    func testYouTubeLinksAreParsedWithoutTrustingOtherHosts() {
        let id = "dQw4w9WgXcQ"
        for url in ["https://www.youtube.com/watch?v=\(id)&t=30", "https://youtu.be/\(id)", "https://m.youtube.com/shorts/\(id)", "https://youtube.com/embed/\(id)"] {
            XCTAssertEqual(WaveLibrary.youtubeVideoID(from: url), id)
        }
        for url in ["https://youtube.com.evil.test/watch?v=\(id)", "https://youtu.be/invalid", "javascript://youtube.com/watch?v=\(id)", "https://user@youtube.com/watch?v=\(id)", "https://youtube.com/playlist?list=abc"] {
            XCTAssertNil(WaveLibrary.youtubeVideoID(from: url))
        }
    }

    func testOnlyExactFileNamesAreMerged() {
        XCTAssertEqual(WaveLibrary.deduplicated(songs).count, 2)
    }

    func testSortingAndCollections() {
        XCTAssertEqual(WaveLibrary.sorted(songs, by: .title).first?.title, "Ámbar")
        XCTAssertEqual(WaveLibrary.artists(in: songs), ["Norte", "Wave"])
        XCTAssertEqual(WaveLibrary.albums(in: songs), ["First light", "Luz"])
    }

    func testAlbumsWithTheSameNameRemainSeparateByArtist() {
        let tracks = [
            Song(id: "a", title: "First", artist: "One", album: "Shared", fileName: "a.m4a"),
            Song(id: "b", title: "Second", artist: "Two", album: "Shared", fileName: "b.m4a"),
            Song(id: "c", title: "Third", artist: "One", album: "Shared", fileName: "c.m4a"),
            Song(id: "d", title: "Untitled", artist: "One", album: "", fileName: "d.m4a")
        ]
        let albums = WaveLibrary.albumGroups(in: tracks)
        XCTAssertEqual(albums.count, 3)
        XCTAssertEqual(albums.first(where: { $0.artist == "One" && $0.title == "Shared" })?.songs.map(\.id), ["a", "c"])
        XCTAssertEqual(albums.first(where: { $0.artist == "Two" })?.songs.map(\.id), ["b"])
        XCTAssertEqual(Set(albums.map(\.id)).count, 3)
    }

    func testDailyMixesAreCompleteBoundedAndStable() {
        let library = (0..<45).map { index in
            Song(id: "song-\(index)", title: "Song \(index)", artist: "Artist \(index % 7)", fileName: "\(index).mp3")
        }
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let mixes = WaveLibrary.dailyMixes(library, day: date)
        XCTAssertTrue((2...3).contains(mixes.count))
        XCTAssertTrue(mixes.allSatisfy { (7...20).contains($0.count) })
        XCTAssertEqual(mixes.map { $0.map(\.id) }, WaveLibrary.dailyMixes(Array(library.reversed()), day: date).map { $0.map(\.id) })
        let ids = mixes.flatMap { $0.map(\.id) }
        XCTAssertEqual(ids.count, Set(ids).count)
        XCTAssertTrue(WaveLibrary.dailyMixes(Array(library.prefix(6)), day: date).isEmpty)
    }

    func testSelectionQueueKeepsCollectionAndSelectedSong() {
        let ids = ["one", "two", "three"]
        XCTAssertEqual(WaveLibrary.selectionQueue(ids, startingAt: "two", shuffle: false), ids)
        let shuffled = WaveLibrary.selectionQueue(ids, startingAt: "two", shuffle: true)
        XCTAssertEqual(shuffled.first, "two")
        XCTAssertEqual(shuffled.count, ids.count)
        XCTAssertEqual(Set(shuffled), Set(ids))
        XCTAssertTrue(WaveLibrary.selectionQueue(ids, startingAt: "other", shuffle: true).isEmpty)
        XCTAssertTrue(WaveLibrary.selectionQueue([], startingAt: "other", shuffle: false).isEmpty)
    }

    func testAutoplayRecyclesOldestInsteadOfStoppingOrRepeatingCurrent() {
        let library = (0..<6).map { Song(id: "s\($0)", title: "Song \($0)", artist: "Artist \($0)", fileName: "\($0).mp3") }
        let history = library.map(\.id)
        let next = WaveLibrary.autoplayCandidates(from: library, excluding: history, limit: 1, currentID: "s5")
        XCTAssertEqual(next.first?.id, "s0")
        XCTAssertTrue(WaveLibrary.autoplayCandidates(from: [library[0]], excluding: ["s0"], currentID: "s0").isEmpty)
    }

    func testAutoplayIsBoundedAndSkipsRecentSongs() {
        let next = WaveLibrary.autoplayCandidates(from: songs, excluding: [songs[0].id, songs[1].id], limit: 2)
        XCTAssertTrue(next.count <= 2)
        XCTAssertFalse(next.contains { $0.id == songs[0].id || $0.id == songs[1].id })
    }
}

final class WaveMixTests: XCTestCase {
    private func track(duration: TimeInterval = 240, bpm: Double? = 120, offset: TimeInterval? = 0.05, lyrics: [LyricLine] = []) -> MixTrack {
        MixTrack(duration: duration, bpm: bpm, barOffset: offset, lyrics: lyrics)
    }

    private func sung() -> [LyricLine] {
        [LyricLine(time: 36, text: "First"), LyricLine(time: 210, text: "Last")]
    }

    func testFallsBackToCrossfadeWithoutBothPulses() {
        let plan = WaveMix.plan(outgoing: track(), incoming: track(bpm: nil))
        XCTAssertEqual(plan.mode, .crossfade)
        XCTAssertFalse(plan.pulseAligned)
        XCTAssertEqual(plan.overlap, 12, accuracy: 0.001)
    }

    func testInstrumentalEdgesMeetOnBothDownbeats() {
        let outgoing = track(lyrics: sung())
        let incoming = track(offset: 0.95, lyrics: sung())
        let plan = WaveMix.plan(outgoing: outgoing, incoming: incoming)
        XCTAssertEqual(plan.mode, .beatmatched)
        XCTAssertTrue(plan.pulseAligned)
        XCTAssertEqual(plan.bars, 9)
        XCTAssertEqual(plan.overlap, 18, accuracy: 0.001)
        let gridA = PulseGrid(bpm: 120, offset: 0.05)!
        let gridB = PulseGrid(bpm: 120, offset: 0.95)!
        XCTAssertEqual(WaveMix.barPhase(plan.startAt, grid: gridA), 0, accuracy: 0.001)
        XCTAssertEqual(WaveMix.barPhase(plan.cue, grid: gridB), 0, accuracy: 0.001)
        XCTAssertLessThanOrEqual(plan.startAt + plan.overlap, outgoing.duration)
        XCTAssertLessThanOrEqual(plan.cue + plan.overlap, 36)
    }

    func testATempoGapKeepsTheInstrumentalOverlapShort() {
        let plan = WaveMix.plan(outgoing: track(lyrics: sung()), incoming: track(bpm: 126, offset: 0.4, lyrics: sung()))
        XCTAssertTrue(plan.pulseAligned)
        XCTAssertLessThan(plan.overlap, 18)
        XCTAssertTrue(plan.reason.contains("drift"))
    }

    func testNearHalfTimeBoundsResidualDrift() {
        let plan = WaveMix.plan(outgoing: track(bpm: 174, lyrics: sung()), incoming: track(bpm: 89.5, lyrics: sung()))
        XCTAssertTrue(plan.pulseAligned)
        XCTAssertLessThanOrEqual(plan.overlap * abs(1 - 89.5 * 2 / 174), WaveMix.driftBeats * 60 / 174 + 0.001)
    }

    func testSongsWithoutLyricsKeepTheOrdinaryPlan() {
        let plan = WaveMix.plan(outgoing: track(), incoming: track(offset: 0.95))
        XCTAssertEqual(plan.mode, .crossfade)
        XCTAssertFalse(plan.pulseAligned)
    }

    func testHandoverGainsAreConstantPowerAndEndCleanly() {
        let start = WaveMix.handoverGains(0)
        XCTAssertEqual(start.outgoing, 1, accuracy: 0.001)
        XCTAssertEqual(start.incoming, 0, accuracy: 0.001)
        let end = WaveMix.handoverGains(1)
        XCTAssertEqual(end.outgoing, 0, accuracy: 0.001)
        XCTAssertEqual(end.incoming, 1, accuracy: 0.001)
        for step in stride(from: 0.0, through: 1.0, by: 0.05) {
            let gains = WaveMix.handoverGains(step)
            XCTAssertEqual(Double(gains.outgoing * gains.outgoing + gains.incoming * gains.incoming), 1, accuracy: 0.001)
        }
    }
}

final class WavePerformanceTests: XCTestCase {
    func testNoHintsKeepsTheFullExperience() {
        XCTAssertEqual(WavePerformance.profile(DeviceSignals()), .full)
    }

    func testReducedMotionAndLowPowerModeWin() {
        XCTAssertEqual(WavePerformance.profile(DeviceSignals(memoryGB: 8, cores: 8, reducedMotion: true)), .lite)
        XCTAssertEqual(WavePerformance.profile(DeviceSignals(memoryGB: 8, cores: 8, lowPowerMode: true)), .lite)
    }

    func testBudgetsGetLighterWithTheProfile() {
        XCTAssertLessThan(WavePerformance.rowsPerPage(.lite), WavePerformance.rowsPerPage(.full))
        XCTAssertLessThan(WavePerformance.analysisByteLimit(.lite), WavePerformance.analysisByteLimit(.full))
        XCTAssertFalse(WavePerformance.allowsAmbientMotion(.lite))
        XCTAssertTrue(WavePerformance.allowsHeavyEffects(.full))
    }
}

final class WaveLayoutTests: XCTestCase {
    func testEveryScreenKeepsTheFullContentWidth() {
        let phone = WaveLayout.metrics(width: 320, height: 640, profile: .lite)
        let tablet = WaveLayout.metrics(width: 820, height: 1180, profile: .balanced)
        let desktop = WaveLayout.metrics(width: 1440, height: 900, profile: .full)
        let fourK = WaveLayout.metrics(width: 3840, height: 2160, profile: .full)
        XCTAssertEqual(phone.columns, 1)
        XCTAssertEqual(tablet.columns, 2)
        XCTAssertEqual(desktop.columns, 3)
        XCTAssertEqual(fourK.columns, 4)
        XCTAssertEqual(phone.maxContentWidth, 320)
        XCTAssertEqual(fourK.maxContentWidth, 3840)
        XCTAssertLessThan(phone.heroSize, fourK.heroSize)
        XCTAssertLessThanOrEqual(phone.padding, fourK.padding)
        XCTAssertFalse(phone.ambientMotion)
        XCTAssertTrue(fourK.ambientMotion)
    }

    func testDynamicTypeScalesTextWithoutChangingTheLayoutCap() {
        let normal = WaveLayout.metrics(width: 1024, height: 768)
        let large = WaveLayout.metrics(width: 1024, height: 768, fontScale: 1.3)
        XCTAssertGreaterThan(large.titleSize, normal.titleSize)
        XCTAssertEqual(large.maxContentWidth, normal.maxContentWidth)
        XCTAssertEqual(large.columns, normal.columns)
    }
}

final class WaveRecapTests: XCTestCase {
    private func fixture() -> ([Song], [HistoryEntry], Date, Calendar) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = calendar.date(from: DateComponents(year: 2026, month: 11, day: 19, hour: 12))!
        let start = calendar.dateInterval(of: .weekOfYear, for: now)!.start
        let songs = [
            Song(id: "a", title: "Signal", artist: "Wave Tests", duration: 100, fileName: "a.m4a"),
            Song(id: "b", title: "Amber", artist: "Norte", duration: 200, fileName: "b.m4a"),
        ]
        let history = [
            HistoryEntry(songID: "a", playedAt: calendar.date(byAdding: .hour, value: 1, to: start)!, completed: true),
            HistoryEntry(songID: "b", playedAt: calendar.date(byAdding: .hour, value: 2, to: start)!, completed: true),
            HistoryEntry(songID: "a", playedAt: calendar.date(byAdding: .hour, value: 3, to: start)!, completed: false),
            HistoryEntry(songID: "a", playedAt: calendar.date(byAdding: .day, value: -20, to: start)!, completed: true),
        ]
        return (songs, history, now, calendar)
    }

    func testWeeklyRecapUsesOnlyLocalHistoryInsideThePeriod() {
        let (songs, history, now, calendar) = fixture()
        let recap = WaveRecap.summarize(songs: songs, history: history, period: .weekly, now: now, calendar: calendar)
        XCTAssertEqual(recap.seconds, 350, accuracy: 0.001)
        XCTAssertEqual(recap.plays, 3)
        XCTAssertEqual(recap.tracks, 2)
        XCTAssertEqual(recap.artists, 2)
        XCTAssertEqual(recap.songs.count, 2)
        XCTAssertEqual(recap.topSongs.first?.song.id, "b")
        XCTAssertEqual(recap.days.count, 7)
        XCTAssertEqual(recap.days.reduce(0, +), 350, accuracy: 0.001)
    }

    func testMonthlyAndYearlyBucketsStayBounded() {
        let (songs, history, now, calendar) = fixture()
        let month = WaveRecap.summarize(songs: songs, history: history, period: .monthly, now: now, calendar: calendar)
        let year = WaveRecap.summarize(songs: songs, history: history, period: .yearly, now: now, calendar: calendar)
        XCTAssertTrue((28...31).contains(month.days.count))
        XCTAssertEqual(year.days.count, 12)
        XCTAssertEqual(month.seconds, 350, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(year.seconds, month.seconds)
    }
}

final class WaveEndingTests: XCTestCase {
    func testEndingVariesWithTheDetectedOutgoingTail() {
        let incoming = MixTrack(duration: 200, bpm: 120, barOffset: 0.05, lyrics: [])
        let fade = MixTrack(duration: 200, bpm: 120, barOffset: 0.05, lyrics: WaveLyrics.parse("[02:50.00]Last line"))
        let echo = MixTrack(duration: 200, bpm: 120, barOffset: 0.05, lyrics: WaveLyrics.parse("[03:16.00]Last line"))
        XCTAssertEqual(WaveMix.plan(outgoing: fade, incoming: incoming).ending, .fadeToZero)
        XCTAssertEqual(WaveMix.plan(outgoing: echo, incoming: incoming).ending, .echoCut)
        XCTAssertEqual(WaveEnding.detect(duration: 5, lastLyric: 4, bpm: 120), .fadeToZero)
    }

    func testEchoTailFadesContinuouslyToZero() {
        XCTAssertEqual(WaveEnding.cut(.echoCut), 1, accuracy: 0.0001)
        let before = WaveEnding.gains(0.749, .echoCut)
        let after = WaveEnding.gains(0.75, .echoCut)
        XCTAssertGreaterThan(after.outgoing, 0)
        XCTAssertEqual(before.outgoing, after.outgoing, accuracy: 0.01)
        let end = WaveEnding.gains(1, .echoCut)
        XCTAssertEqual(end.outgoing, 0, accuracy: 0.0001)
        XCTAssertEqual(end.incoming, 1, accuracy: 0.0001)
    }
}
