#if os(iOS)
import Foundation
import XCTest
import UIKit
@testable import Wave
import WaveCore


final class WaveAudioTests: XCTestCase {
    private func silentWave() throws -> URL {
        let sampleRate: UInt32 = 8_000
        let samples = Int(sampleRate) * 4
        var data = Data()
        func text(_ value: String) { data.append(contentsOf: value.utf8) }
        func u32(_ value: UInt32) { var n = value.littleEndian; withUnsafeBytes(of: &n) { data.append(contentsOf: $0) } }
        func u16(_ value: UInt16) { var n = value.littleEndian; withUnsafeBytes(of: &n) { data.append(contentsOf: $0) } }
        text("RIFF"); u32(UInt32(36 + samples * 2)); text("WAVEfmt "); u32(16)
        u16(1); u16(1); u32(sampleRate); u32(sampleRate * 2); u16(2); u16(16)
        text("data"); u32(UInt32(samples * 2)); data.append(Data(count: samples * 2))
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        try data.write(to: url, options: .atomic)
        return url
    }

    @MainActor
    func testPlaybackPreferencesPersistAndDefaultToEnabled() {
        let suite = "wave-tests-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let first = WaveState(defaults: defaults)
        XCTAssertTrue(first.mixEnabled)
        XCTAssertTrue(first.autoplayEnabled)
        XCTAssertFalse(first.automaticLyricsEnabled)
        first.automaticLyricsEnabled = true
        first.mixEnabled = false
        first.autoplayEnabled = false
        let restored = WaveState(defaults: defaults)
        XCTAssertFalse(restored.mixEnabled)
        XCTAssertFalse(restored.autoplayEnabled)
        XCTAssertTrue(restored.automaticLyricsEnabled)
        restored.automaticLyricsEnabled = false
        restored.mixEnabled = true
        restored.autoplayEnabled = true
        let enabled = WaveState(defaults: defaults)
        XCTAssertTrue(enabled.mixEnabled)
        XCTAssertTrue(enabled.autoplayEnabled)
        XCTAssertFalse(enabled.automaticLyricsEnabled)
    }

    @MainActor
    func testHomeShortcutsOpenTheRequestedLibraryAndResetNavigation() {
        let state = WaveState()
        for section in LibrarySection.allCases {
            let previous = state.libraryNavigationID
            state.openLibrary(section)
            XCTAssertEqual(state.selectedTab, 1)
            XCTAssertEqual(state.librarySection, section)
            XCTAssertNotEqual(state.libraryNavigationID, previous)
        }
    }

    @MainActor
    func testAppearanceColorsRespondToSystemTheme() {
        let light = UIColor(WaveTheme.background).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        let dark = UIColor(WaveTheme.background).resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
        var lightWhite: CGFloat = 0
        var darkWhite: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(light.getWhite(&lightWhite, alpha: &alpha) || light.getRed(&lightWhite, green: nil, blue: nil, alpha: &alpha))
        XCTAssertTrue(dark.getWhite(&darkWhite, alpha: &alpha) || dark.getRed(&darkWhite, green: nil, blue: nil, alpha: &alpha))
        XCTAssertGreaterThan(lightWhite, darkWhite)
    }

    @MainActor
    func testPlaybackFailureDoesNotDiscardCurrentDeck() throws {
        let file = try silentWave()
        defer { try? FileManager.default.removeItem(at: file) }
        let player = AudioPlayer()
        defer { player.stop() }
        XCTAssertTrue(player.play(url: file))
        player.seek(1)
        XCTAssertFalse(player.play(url: file.appendingPathExtension("missing")))
        XCTAssertTrue(player.isPlaying)
        XCTAssertGreaterThanOrEqual(player.time, 0.9)
        player.pause()
        XCTAssertFalse(player.isPlaying)
        player.resume()
        XCTAssertTrue(player.isPlaying)
    }

    @MainActor
    func testSeekingCancelsAnActiveMix() throws {
        let first = try silentWave()
        let second = try silentWave()
        defer { try? FileManager.default.removeItem(at: first); try? FileManager.default.removeItem(at: second) }
        let player = AudioPlayer()
        defer { player.stop() }
        XCTAssertTrue(player.play(url: first))
        let plan = MixPlan(mode: .crossfade, overlap: 1, startAt: 0, cue: 0, bars: 0, pulseAligned: false, reason: "test", ending: .fadeToZero)
        XCTAssertTrue(player.startMix(nextURL: second, nextID: "next", plan: plan))
        XCTAssertNotNil(player.mixProgress)
        player.seek(2)
        XCTAssertNil(player.mixProgress)
        XCTAssertEqual(player.time, 2, accuracy: 0.1)
        XCTAssertTrue(player.isPlaying)
    }
}
#endif
