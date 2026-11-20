import Foundation
import AVFoundation
import WaveCore

/// Two decks, never one.
///
/// A Mix on the phone is the same idea as on the web: the arriving song is
/// prepared in silence while the current one plays, then both are heard for a
/// few bars at staged constant-power gains. Nothing is time-stretched and the
/// files on disk are untouched. The clock is a single 20 Hz timer — cheap on a
/// small device, and the same clock that reports the playing position.
@MainActor
final class AudioPlayer: ObservableObject {
    @Published private(set) var isPlaying = false
    @Published private(set) var time: TimeInterval = 0
    @Published private(set) var mixProgress: Double?
    @Published var volume: Float = 1 {
        didSet { if mixProgress == nil { deck?.volume = volume } }
    }

    private var deck: AVAudioPlayer?
    private var arriving: AVAudioPlayer?
    private var clock: Timer?
    private var mixStartedAt: Date?
    private var pausedAt: Date?
    private var activePlan: MixPlan?
    private var arrivingSongID: String?
    private var endReported = false

    var onFinished: (@MainActor () -> Void)?
    var onMixCompleted: (@MainActor (String) -> Void)?
    var onTick: (@MainActor (TimeInterval) -> Void)?

    func play(url: URL, from position: TimeInterval = 0) {
        stop()
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.prepareToPlay()
            if position > 0 { player.currentTime = min(position, max(0, player.duration - 0.1)) }
            player.volume = volume
            try? AVAudioSession.sharedInstance().setActive(true)
            player.play()
            deck = player
            isPlaying = true
            endReported = false
            startClock()
        } catch {
            isPlaying = false
        }
    }

    /// Starts the handover. The plan comes from `WaveMix`, which places both
    /// instrumental edges on a downbeat when the two pulses are known.
    func startMix(nextURL: URL, nextID: String, plan: MixPlan) {
        guard plan.mode != .cut, plan.overlap >= 0.5, let outgoing = deck else {
            play(url: nextURL, from: plan.cue)
            onMixCompleted?(nextID)
            return
        }
        do {
            let next = try AVAudioPlayer(contentsOf: nextURL)
            next.currentTime = plan.cue
            next.volume = 0
            next.prepareToPlay()
            try? AVAudioSession.sharedInstance().setActive(true)
            next.play()
            if outgoing.currentTime < plan.startAt { outgoing.currentTime = plan.startAt }
            arriving = next
            arrivingSongID = nextID
            activePlan = plan
            mixStartedAt = Date()
            pausedAt = nil
            mixProgress = 0
            // A manual Next can arrive while the idle clock has been stopped.
            // The handover owns one clock and releases it when it completes.
            startClock()
            endReported = false
        } catch {
            play(url: nextURL, from: plan.cue)
            onMixCompleted?(nextID)
        }
    }

    func pause() {
        deck?.pause()
        arriving?.pause()
        // A paused player has no clock to service; remove the repeating timer
        // instead of letting it tick against an unchanged position. Keep the
        // handover's musical time so resuming does not skip part of the fade.
        if activePlan != nil { pausedAt = Date() }
        clock?.invalidate()
        clock = nil
        isPlaying = false
    }

    func resume() {
        try? AVAudioSession.sharedInstance().setActive(true)
        deck?.play()
        arriving?.play()
        if let pausedAt, let mixStartedAt, activePlan != nil {
            self.mixStartedAt = mixStartedAt.addingTimeInterval(Date().timeIntervalSince(pausedAt))
        }
        pausedAt = nil
        isPlaying = true
        startClock()
    }

    func stop() {
        clock?.invalidate()
        clock = nil
        deck?.stop()
        arriving?.stop()
        deck = nil
        arriving = nil
        activePlan = nil
        mixStartedAt = nil
        pausedAt = nil
        arrivingSongID = nil
        mixProgress = nil
        isPlaying = false
        endReported = false
    }

    func seek(_ seconds: TimeInterval) {
        guard let deck else { return }
        deck.currentTime = max(0, min(seconds, max(0, deck.duration - 0.1)))
        time = deck.currentTime
        endReported = false
    }

    private func startClock() {
        clock?.invalidate()
        clock = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        if let plan = activePlan, let started = mixStartedAt, let next = arriving {
            let progress = min(1, max(0, Date().timeIntervalSince(started) / plan.overlap))
            let cut = WaveEnding.cut(plan.ending)
            let gains = WaveEnding.gains(
                progress,
                plan.ending,
                crossfade: plan.mode == .crossfade
            )
            deck?.volume = gains.outgoing * volume
            next.volume = gains.incoming * volume
            mixProgress = min(1, progress / cut)
            if progress >= cut {
                let promoted = next
                deck?.stop()
                promoted.volume = volume
                deck = promoted
                arriving = nil
                activePlan = nil
                mixStartedAt = nil
                mixProgress = nil
                let id = arrivingSongID ?? ""
                arrivingSongID = nil
                onMixCompleted?(id)
            }
        }

        guard let deck else { return }
        time = deck.currentTime
        onTick?(deck.currentTime)
        if activePlan == nil, !endReported, deck.duration > 0, deck.currentTime >= deck.duration - 0.12 {
            endReported = true
            onFinished?()
        }
    }
}
