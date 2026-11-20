import ActivityKit
import AVFoundation
import Foundation
import UIKit
import WidgetKit
import WaveCore

/// The meeting point between SwiftUI and iOS itself.
///
/// The app keeps its own library, player and clock. This object only answers
/// system surfaces: App Intents and deep links, widget timeline refreshes,
/// Live Activities/Dynamic Island, Handoff, audio interruptions, audio focus
/// and headset route changes. It never opens a network connection.
@MainActor
final class WaveSystemCenter: NSObject, ObservableObject {
    private weak var state: WaveState?
    private var activity: Activity<WaveActivityAttributes>?
    private var handoff: NSUserActivity?
    private var observers: [NSObjectProtocol] = []

    func connect(state: WaveState) {
        self.state = state
        let center = NotificationCenter.default
        observers.forEach { center.removeObserver($0) }
        observers.removeAll()

        func observe(_ name: Notification.Name, _ action: @escaping @MainActor () -> Void) {
            observers.append(
                center.addObserver(forName: name, object: nil, queue: .main) { _ in
                    Task { @MainActor in action() }
                }
            )
        }

        observe(.waveOpenHome) { self.state?.openHomeFromSystem() }
        observe(.waveOpenSearch) { self.state?.openSearchFromSystem() }
        observe(.waveOpenRemix) { self.state?.openRemixFromSystem() }
        observe(.waveResumePlayback) { self.state?.resumeFromSystem() }
        observe(.waveTogglePlayback) { self.state?.toggleFromSystem() }
        observe(.wavePausePlayback) { self.state?.pauseFromSystem() }
        observe(.waveNextTrack) { self.state?.nextFromSystem() }
        observe(.wavePlayRemix) { self.state?.playRemixFromSystem() }
        observe(.wavePlayFavorites) { self.state?.playFavoritesFromSystem() }
        observers.append(
            center.addObserver(forName: .waveCapture, object: nil, queue: .main) { notification in
                let page = notification.object as? String ?? "home"
                Task { @MainActor in self.state?.configureCapture(page: page) }
            }
        )

        observeAudioSession()
        seedHandoff()
        reloadWidgets()
    }

    func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    func update(song: Song?, time: TimeInterval, playing: Bool) {
        updateHandoff(song: song)
        Task { @MainActor in
            await self.updateLiveActivity(song: song, time: time, playing: playing)
        }
    }

    private func observeAudioSession() {
        let center = NotificationCenter.default
        observers.append(
            center.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: AVAudioSession.sharedInstance(),
                queue: .main
            ) { [weak self] notification in
                guard
                    let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                    let type = AVAudioSession.InterruptionType(rawValue: raw)
                else { return }
                Task { @MainActor in
                    guard let self else { return }
                    if type == .began {
                        self.state?.pauseFromSystem()
                    } else if type == .ended {
                        let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                        if AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume) {
                            self.state?.resumeFromSystem()
                        }
                    }
                }
            }
        )
        observers.append(
            center.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: AVAudioSession.sharedInstance(),
                queue: .main
            ) { [weak self] notification in
                guard
                    let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                    raw == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
                else { return }
                Task { @MainActor in self?.state?.pauseFromSystem() }
            }
        )
    }

    private func updateLiveActivity(song: Song?, time: TimeInterval, playing: Bool) async {
        guard #available(iOS 18, *) else { return }
        let contentState = WaveActivityAttributes.ContentState(
            time: song == nil ? 0 : time,
            duration: song?.duration ?? 0,
            playing: song == nil ? false : playing,
            mixEnabled: state?.mixEnabled ?? false
        )
        let content = ActivityContent(state: contentState, staleDate: nil, relevanceScore: playing ? 50 : 0)
        guard let song else {
            await activity?.end(content, dismissalPolicy: .immediate)
            activity = nil
            return
        }
        if let activity {
            await activity.update(content)
        } else if ActivityAuthorizationInfo().areActivitiesEnabled {
            let attributes = WaveActivityAttributes(
                songID: song.id,
                title: song.title,
                artist: song.artist,
                album: song.album
            )
            if let requested = try? Activity<WaveActivityAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: nil
            ) {
                activity = requested
            }
        }
    }

    private func seedHandoff() {
        let activity = NSUserActivity(activityType: "io.github.jaimegaming.wave.playback")
        activity.title = WaveTheme.loc("Continue listening")
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = false
        activity.isEligibleForPrediction = false
        handoff = activity
    }

    private func updateHandoff(song: Song?) {
        guard let handoff, let song else { return }
        handoff.title = "\(song.title) — \(song.artist)"
        handoff.userInfo = [
            "songID": song.id,
            "title": song.title,
            "artist": song.artist,
        ]
        handoff.becomeCurrent()
    }
}
