import Foundation

/// What the iPhone knows about a song before a handover.
///
/// The iOS client does not decode a whole file to find beats. It uses optional
/// tempo tags and the timings of the listener's own LRC lyrics: the words tell
/// it where the sung part ends, and therefore where the instrumental outro and
/// intro are. Both cues are then placed on a downbeat of their own grid.
public struct MixTrack: Sendable {
    public let duration: TimeInterval
    public let bpm: Double?
    public let barOffset: TimeInterval?
    public let lyrics: [LyricLine]

    public init(duration: TimeInterval, bpm: Double? = nil, barOffset: TimeInterval? = nil, lyrics: [LyricLine] = []) {
        self.duration = duration
        self.bpm = bpm
        self.barOffset = barOffset
        self.lyrics = lyrics
    }
}

public struct PulseGrid: Sendable {
    public let bpm: Double
    public let offset: TimeInterval

    public init?(bpm: Double?, offset: TimeInterval?) {
        guard let bpm, bpm >= 60, bpm <= 200, let offset, offset.isFinite else { return nil }
        self.bpm = bpm
        self.offset = offset
    }

    /// Four beats to the bar, in seconds.
    public var bar: TimeInterval { WaveMix.beatsPerBar * 60 / bpm }
}

public enum EndingShape: String, Codable, Equatable, Sendable {
    /// Follow the recorded tail all the way to silence.
    case fadeToZero
    /// A ringing tail, cut at 75 % of the fade before it reaches zero.
    case echoCut
}

public struct MixPlan: Equatable, Sendable {
    public enum Mode: String, Sendable {
        case beatmatched
        case crossfade
        case cut
    }

    public let mode: Mode
    public let overlap: TimeInterval
    /// Where in the outgoing song the two records start sharing the room.
    public let startAt: TimeInterval
    /// Where the incoming song starts playing.
    public let cue: TimeInterval
    public let bars: Int
    /// Both instrumental edges start on a downbeat of their own pulse.
    public let pulseAligned: Bool
    public let ending: EndingShape
    public let reason: String

    public init(mode: Mode, overlap: TimeInterval, startAt: TimeInterval, cue: TimeInterval, bars: Int, pulseAligned: Bool, reason: String, ending: EndingShape = .fadeToZero) {
        self.mode = mode
        self.overlap = overlap
        self.startAt = startAt
        self.cue = cue
        self.bars = bars
        self.pulseAligned = pulseAligned
        self.ending = ending
        self.reason = reason
    }
}

public enum WaveMix {
    public static let beatsPerBar: Double = 4
    public static let targetSeconds: TimeInterval = 20
    public static let floorSeconds: TimeInterval = 12
    public static let minInstrumentalSeconds: TimeInterval = 4
    public static let driftBeats: Double = 1.5
    /// Half/double time is the same pulse at two speeds; nothing drifts.
    public static let octaveTolerance = 0.03

    public static func plan(outgoing: MixTrack, incoming: MixTrack) -> MixPlan {
        let ending = WaveEnding.detect(
            duration: outgoing.duration,
            lastLyric: WaveLyrics.sungBounds(outgoing.lyrics)?.last,
            bpm: outgoing.bpm
        )
        guard outgoing.duration > 8, incoming.duration > 8 else {
            return MixPlan(mode: .cut, overlap: 0, startAt: outgoing.duration, cue: 0, bars: 0, pulseAligned: false, reason: "A song is too short to mix honestly.", ending: ending)
        }
        if let aligned = instrumentalPulse(outgoing: outgoing, incoming: incoming) {
            return MixPlan(
                mode: aligned.mode,
                overlap: aligned.overlap,
                startAt: aligned.startAt,
                cue: aligned.cue,
                bars: aligned.bars,
                pulseAligned: aligned.pulseAligned,
                reason: aligned.reason,
                ending: ending
            )
        }

        // No trustworthy pulse on both sides: an equal-power crossfade, still
        // short enough that it never eats an intro.
        let overlap = min(floorSeconds, outgoing.duration / 4, incoming.duration / 4)
        return MixPlan(
            mode: .crossfade,
            overlap: overlap,
            startAt: outgoing.duration - overlap,
            cue: 0,
            bars: 0,
            pulseAligned: false,
            reason: "Crossfade: the two pulses cannot be placed on a bar.",
            ending: ending
        )
    }

    /// The 3.0 Mix rule: an instrumental outro meeting an instrumental intro
    /// must start on a downbeat of both records, and stay together for as long
    /// as their tempos allow. Neither song is sped up or slowed down.
    public static func instrumentalPulse(outgoing: MixTrack, incoming: MixTrack) -> MixPlan? {
        let ending = WaveEnding.detect(
            duration: outgoing.duration,
            lastLyric: WaveLyrics.sungBounds(outgoing.lyrics)?.last,
            bpm: outgoing.bpm
        )
        guard
            let gridA = PulseGrid(bpm: outgoing.bpm, offset: outgoing.barOffset),
            let gridB = PulseGrid(bpm: incoming.bpm, offset: incoming.barOffset),
            let sungOut = WaveLyrics.sungBounds(outgoing.lyrics),
            let sungIn = WaveLyrics.sungBounds(incoming.lyrics)
        else { return nil }

        let tail = (start: min(outgoing.duration, sungOut.last + 1.5), end: outgoing.duration)
        let head = (start: 0.0, end: min(incoming.duration, max(0, sungIn.first)))
        guard
            tail.end - tail.start >= minInstrumentalSeconds,
            head.end - head.start >= minInstrumentalSeconds
        else { return nil }

        let barA = gridA.bar
        let barB = gridB.bar
        let startCeiling = tail.end - 2 * barA
        let cueCeiling = head.end - 2 * barB
        guard startCeiling >= tail.start, cueCeiling >= head.start else { return nil }

        let desiredStart = max(tail.start, outgoing.duration - targetSeconds)
        guard let startAt = downbeat(gridA, nearest: desiredStart, from: tail.start, to: startCeiling),
              let cue = downbeat(gridB, nearest: min(6, cueCeiling), from: head.start, to: cueCeiling)
        else { return nil }

        let rawRatio = gridA.bpm / gridB.bpm
        let octave = abs(rawRatio / 2 - 1) <= octaveTolerance || abs(rawRatio * 2 - 1) <= octaveTolerance
        let drift = octave ? 0.0 : abs(1 - gridB.bpm / gridA.bpm)
        let driftLimit = drift > 0 ? driftBeats * 60 / gridA.bpm / drift : Double.infinity
        let available = min(targetSeconds, tail.end - startAt, head.end - cue, driftLimit)
        let bars = Int(floor(available / barA + 1e-9))
        guard bars >= 2 else { return nil }
        let overlap = Double(bars) * barA

        return MixPlan(
            mode: .beatmatched,
            overlap: overlap,
            startAt: startAt,
            cue: cue,
            bars: bars,
            pulseAligned: true,
            reason: octave
                ? "Instrumental outro and intro meet on the same downbeat; both keep their own tempo."
                : "Instrumental outro and intro meet on the same downbeat; the overlap is bounded so the pulses do not drift.",
            ending: ending
        )
    }

    /// Seconds since the last downbeat; a hair before the bar line is still
    /// the same downbeat (floating point, not a whole bar of drift).
    public static func barPhase(_ time: TimeInterval, grid: PulseGrid) -> TimeInterval {
        let bar = grid.bar
        var phase = (time - grid.offset).truncatingRemainder(dividingBy: bar)
        if phase < 0 { phase += bar }
        return phase >= bar - 1e-6 ? 0 : phase
    }

    /// The downbeat inside [from, to] nearest to `desired`, in whole bars only.
    public static func downbeat(_ grid: PulseGrid, nearest desired: TimeInterval, from: TimeInterval, to: TimeInterval) -> TimeInterval? {
        guard to >= from else { return nil }
        let bar = grid.bar
        let first = Int(ceil((from - grid.offset) / bar - 1e-9))
        var best: TimeInterval?
        var distance = Double.infinity
        for index in first...(first + 128) {
            let time = grid.offset + Double(index) * bar
            if time > to + 1e-9 { break }
            let candidate = abs(time - desired)
            if candidate < distance - 1e-9 || (candidate <= distance + 1e-9 && best.map({ time < $0 }) ?? false) {
                best = time
                distance = candidate
            }
        }
        return best
    }

    /// The staged, constant-power gains the two AVAudioPlayer decks use.
    /// A quick arrival, a held middle, then the outgoing song leaves on the
    /// phrase: the same shape as the web and Android Mix.
    public static func handoverGains(_ progress: Double) -> (outgoing: Float, incoming: Float) {
        let p = min(1, max(0, progress))
        let phase: Double
        if p < 0.28 {
            phase = 0.5 * smooth(p / 0.28)
        } else if p < 0.62 {
            phase = 0.5 + 0.06 * smooth((p - 0.28) / 0.34)
        } else {
            phase = 0.56 + 0.44 * smooth((p - 0.62) / 0.38)
        }
        return (Float(cos(phase * Double.pi / 2)), Float(sin(phase * Double.pi / 2)))
    }

    public static func crossfadeGains(_ progress: Double) -> (outgoing: Float, incoming: Float) {
        let p = min(1, max(0, progress)) * Double.pi / 2
        return (Float(cos(p)), Float(sin(p)))
    }

    private static func smooth(_ value: Double) -> Double {
        let t = min(1, max(0, value))
        return t * t * (3 - 2 * t)
    }
}

/// Ending detection and the two release curves shared by every iOS Mix.
public enum WaveEnding {
    public static let echoCutFraction: Double = 0.75

    /// Local evidence only: duration, the last timed lyric and an optional tempo
    /// tag. A voice still near the end has no long recorded fade to follow.
    public static func detect(duration: TimeInterval, lastLyric: TimeInterval?, bpm: Double?) -> EndingShape {
        guard duration.isFinite, duration >= 8, let lastLyric, lastLyric.isFinite, lastLyric > 0 else {
            return .fadeToZero
        }
        let bar: Double
        if let tagged = bpm, tagged >= 60, tagged <= 200 {
            bar = 240 / tagged
        } else {
            bar = 2
        }
        let shortTail = max(4, min(8, 2 * bar))
        return duration - lastLyric <= shortTail ? .echoCut : .fadeToZero
    }

    public static func cut(_ shape: EndingShape) -> Double {
        shape == .echoCut ? echoCutFraction : 1
    }

    /// Fade to zero, or a decaying echo ripple cut at 75 % while the incoming
    /// song is already at level. `crossfade` uses the same base curve the plan
    /// would have used without this ending decision.
    public static func gains(_ progress: Double, _ shape: EndingShape, crossfade: Bool = false) -> (outgoing: Float, incoming: Float) {
        let p = min(1, max(0, progress))
        let base = crossfade ? WaveMix.crossfadeGains(p) : WaveMix.handoverGains(p)
        if shape == .fadeToZero { return base }
        if p >= echoCutFraction { return (0, 1) }
        let atCut = crossfade ? WaveMix.crossfadeGains(echoCutFraction) : WaveMix.handoverGains(echoCutFraction)
        let ripple = 1 + 0.1 * exp(-3 * p) * cos(6 * Double.pi * p)
        let outgoing = min(1, max(0, Double(base.outgoing) * ripple))
        let incoming = min(1, max(0, Double(base.incoming) / max(0.001, Double(atCut.incoming))))
        return (Float(outgoing), Float(incoming))
    }
}
