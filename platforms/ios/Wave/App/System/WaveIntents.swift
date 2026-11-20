import AppIntents
import Foundation
import WaveCore

/// The names widgets, controls, Siri, Shortcuts, Handoff and deep links use to
/// ask the running app for one of its own actions. No service receives them.
extension Notification.Name {
    static let waveOpenHome = Notification.Name("wave.open.home")
    static let waveOpenSearch = Notification.Name("wave.open.search")
    static let waveOpenRemix = Notification.Name("wave.open.remix")
    static let waveResumePlayback = Notification.Name("wave.resume.playback")
    static let waveTogglePlayback = Notification.Name("wave.toggle.playback")
    static let wavePausePlayback = Notification.Name("wave.pause.playback")
    static let waveNextTrack = Notification.Name("wave.next.track")
    static let wavePlayRemix = Notification.Name("wave.play.remix")
    static let wavePlayFavorites = Notification.Name("wave.play.favorites")
    static let waveCapture = Notification.Name("wave.capture")
}

/// App Intents are iOS system integrations: Siri, Spotlight, Shortcuts, the
/// Action button, widgets and Control Center all discover the same local verbs.
@available(iOS 16.0, *)
struct OpenWaveIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Wave"
    static let description = IntentDescription("Open Wave on its Home screen.")
    static let openAppWhenRun = true
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .waveOpenHome, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct ResumePlaybackIntent: AppIntent {
    static let title: LocalizedStringResource = "Resume playback"
    static let description = IntentDescription("Continue the song that is already in Wave.")
    static let openAppWhenRun = true
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .waveResumePlayback, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct TogglePlaybackIntent: AppIntent {
    static let title: LocalizedStringResource = "Play or pause"
    static let description = IntentDescription("Play or pause Wave without opening a screen.")
    static let openAppWhenRun = false
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .waveTogglePlayback, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct NextTrackIntent: AppIntent {
    static let title: LocalizedStringResource = "Next"
    static let description = IntentDescription("Play the following song in Wave.")
    static let openAppWhenRun = false
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .waveNextTrack, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct OpenRemixIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Remix"
    static let description = IntentDescription("Show the listening recap and its Remix.")
    static let openAppWhenRun = true
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .waveOpenRemix, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct PlayRemixIntent: AppIntent {
    static let title: LocalizedStringResource = "Play Remix"
    static let description = IntentDescription("Play the songs the week chose.")
    static let openAppWhenRun = true
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .wavePlayRemix, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct PlayFavoritesIntent: AppIntent {
    static let title: LocalizedStringResource = "Play favorites"
    static let description = IntentDescription("Play the songs marked as favorites.")
    static let openAppWhenRun = true
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .wavePlayFavorites, object: nil)
        return .result()
    }
}

@available(iOS 16.0, *)
struct SearchSongsIntent: AppIntent {
    static let title: LocalizedStringResource = "Search songs"
    static let description = IntentDescription("Open the local library search.")
    static let openAppWhenRun = true
    static let isDiscoverable = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .waveOpenSearch, object: nil)
        return .result()
    }
}

/// One vocabulary for Siri, Shortcuts and Spotlight; no phrase calls a network.
@available(iOS 16.0, *)
struct WaveShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ResumePlaybackIntent(),
            phrases: ["Resume music in \(.applicationName)", "Continue listening in \(.applicationName)"],
            shortTitle: "Resume playback",
            systemImageName: "play.fill"
        )
        AppShortcut(
            intent: PlayRemixIntent(),
            phrases: ["Play my Remix in \(.applicationName)", "Play this week in \(.applicationName)"],
            shortTitle: "Play Remix",
            systemImageName: "chart.bar.fill"
        )
        AppShortcut(
            intent: OpenRemixIntent(),
            phrases: ["Show Remix in \(.applicationName)"],
            shortTitle: "Show Remix",
            systemImageName: "chart.bar"
        )
        AppShortcut(
            intent: SearchSongsIntent(),
            phrases: ["Search songs in \(.applicationName)"],
            shortTitle: "Search songs",
            systemImageName: "magnifyingglass"
        )
    }
}
