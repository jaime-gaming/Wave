import Foundation
import AVFoundation
import WaveCore








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

    @discardableResult
    func play(url: URL, from position: TimeInterval = 0) -> Bool {
        do {
            let next = try AVAudioPlayer(contentsOf: url)
            guard next.prepareToPlay() else { return false }
            if position.isFinite && position > 0 { next.currentTime = min(position, max(0, next.duration - 0.1)) }
            next.volume = volume
            try? AVAudioSession.sharedInstance().setActive(true)
            guard next.play() else { return false }

            stop()
            deck = next
            time = next.currentTime
            isPlaying = true
            endReported = false
            startClock()
            return true
        } catch {
            return false
        }
    }



    @discardableResult
    func startMix(nextURL: URL, nextID: String, plan: MixPlan) -> Bool {
        guard isPlaying, plan.mode != .cut, plan.overlap >= 0.5, let outgoing = deck else {
            guard play(url: nextURL, from: plan.cue) else { return false }
            onMixCompleted?(nextID)
            return true
        }
        do {
            let next = try AVAudioPlayer(contentsOf: nextURL)
            next.currentTime = plan.cue
            next.volume = 0
            guard next.prepareToPlay() else { return false }
            try? AVAudioSession.sharedInstance().setActive(true)
            guard next.play() else { return false }
            if outgoing.currentTime < plan.startAt { outgoing.currentTime = plan.startAt }
            cancelMix()
            arriving = next
            arrivingSongID = nextID
            activePlan = plan
            mixStartedAt = Date()
            pausedAt = nil
            mixProgress = 0


            startClock()
            endReported = false
            return true
        } catch {

            return false
        }
    }

    func pause() {
        deck?.pause()
        arriving?.pause()



        if activePlan != nil { pausedAt = Date() }
        clock?.invalidate()
        clock = nil
        isPlaying = false
    }

    func resume() {
        guard let deck else { isPlaying = false; return }
        try? AVAudioSession.sharedInstance().setActive(true)
        guard deck.play() else { isPlaying = false; return }
        if let arriving, !arriving.play() { cancelMix() }
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


    func cancelMix() {
        arriving?.stop()
        arriving = nil
        arrivingSongID = nil
        activePlan = nil
        mixStartedAt = nil
        pausedAt = nil
        mixProgress = nil
        deck?.volume = volume
    }

    func seek(_ seconds: TimeInterval) {
        guard seconds.isFinite, let deck else { return }
        cancelMix()
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
