import UIKit
import Foundation
import AVFoundation
import WaveCore

/// Playback continues with the screen off, from the lock screen, the Control
/// Center, headphones and CarPlay. The audio session and remote-control events
/// are the two things that make an iPhone app a music app rather than a view.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(false)
        } catch {
            // Playback still works in the foreground if a session cannot be set.
        }
        application.beginReceivingRemoteControlEvents()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // The audio session stays active while a deck is playing; the background
        // audio mode in Info.plist keeps the process alive for it.
    }

    /// `wave://` links come from the widget, Control Center and Shortcuts.
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        guard url.scheme == "wave" else { return false }
        let name: Notification.Name
        var payload: Any?
        switch url.host {
        case "capture":
            name = .waveCapture
            payload = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "page" })?.value ?? "home"

        case "play-remix": name = .wavePlayRemix
        case "favorites": name = .wavePlayFavorites
        case "resume": name = .waveResumePlayback
        case "toggle": name = .waveTogglePlayback
        case "next": name = .waveNextTrack
        case "search": name = .waveOpenSearch
        default: name = .waveOpenHome
        }
        NotificationCenter.default.post(name: name, object: payload)
        return true
    }

    /// Handoff brings a playing song to another nearby device through the
    /// system's own encrypted channel; no Wave service is involved.
    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == "io.github.jaimegaming.wave.playback" else { return false }
        NotificationCenter.default.post(name: .waveResumePlayback, object: nil)
        return true
    }
}
