import UIKit
import Foundation
import AVFoundation
import WaveCore




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

        }
        application.beginReceivingRemoteControlEvents()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {


    }


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
