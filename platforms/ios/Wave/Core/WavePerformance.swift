import Foundation







public enum DeviceProfile: String, Sendable {
    case lite
    case balanced
    case full
}

public struct DeviceSignals: Sendable {
    public var memoryGB: Double?
    public var cores: Int?
    public var reducedMotion: Bool
    public var lowPowerMode: Bool
    public var screenScale: Double?
    public var smallScreen: Bool

    public init(
        memoryGB: Double? = nil,
        cores: Int? = nil,
        reducedMotion: Bool = false,
        lowPowerMode: Bool = false,
        screenScale: Double? = nil,
        smallScreen: Bool = false
    ) {
        self.memoryGB = memoryGB
        self.cores = cores
        self.reducedMotion = reducedMotion
        self.lowPowerMode = lowPowerMode
        self.screenScale = screenScale
        self.smallScreen = smallScreen
    }
}

public enum WavePerformance {
    public static func profile(_ signals: DeviceSignals) -> DeviceProfile {
        if signals.reducedMotion || signals.lowPowerMode { return .lite }
        let informative = signals.memoryGB != nil || signals.cores != nil
        if !informative { return .full }

        var score = 0
        if let memory = signals.memoryGB {
            score += memory <= 2 ? -2 : memory <= 4 ? -1 : memory >= 6 ? 1 : 0
        }
        if let cores = signals.cores {
            score += cores <= 2 ? -2 : cores <= 4 ? -1 : cores >= 8 ? 1 : 0
        }
        if let scale = signals.screenScale, scale >= 3 { score -= 1 }
        if signals.smallScreen { score -= 1 }
        return score <= -3 ? .lite : score <= 0 ? .balanced : .full
    }

    public static func rowsPerPage(_ profile: DeviceProfile) -> Int {
        switch profile {
        case .lite: return 32
        case .balanced: return 60
        case .full: return 80
        }
    }


    public static func analysisByteLimit(_ profile: DeviceProfile) -> Int {
        switch profile {
        case .lite: return 8 * 1024 * 1024
        case .balanced: return 16 * 1024 * 1024
        case .full: return 24 * 1024 * 1024
        }
    }

    public static func allowsAmbientMotion(_ profile: DeviceProfile) -> Bool {
        profile == .full
    }

    public static func allowsHeavyEffects(_ profile: DeviceProfile) -> Bool {
        profile != .lite
    }
}
