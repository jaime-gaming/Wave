import CoreGraphics
import Foundation







public struct RemixMetrics: Sendable, Equatable {
    public let columns: Int
    public let heroSize: CGFloat
    public let titleSize: CGFloat
    public let bodySize: CGFloat
    public let coverSize: CGFloat
    public let padding: CGFloat
    public let gap: CGFloat
    public let corner: CGFloat
    public let maxContentWidth: CGFloat
    public let ambientMotion: Bool

    public init(
        columns: Int,
        heroSize: CGFloat,
        titleSize: CGFloat,
        bodySize: CGFloat,
        coverSize: CGFloat,
        padding: CGFloat,
        gap: CGFloat,
        corner: CGFloat,
        maxContentWidth: CGFloat,
        ambientMotion: Bool
    ) {
        self.columns = columns
        self.heroSize = heroSize
        self.titleSize = titleSize
        self.bodySize = bodySize
        self.coverSize = coverSize
        self.padding = padding
        self.gap = gap
        self.corner = corner
        self.maxContentWidth = maxContentWidth
        self.ambientMotion = ambientMotion
    }
}

public enum WaveLayout {
    public static func metrics(
        width: CGFloat,
        height: CGFloat,
        fontScale: CGFloat = 1,
        profile: DeviceProfile = .full
    ) -> RemixMetrics {
        let safeWidth = max(280, width)
        let safeHeight = max(320, height)
        let scale = min(1.3, max(0.85, fontScale))
        let columns = safeWidth < 600 ? 1 : safeWidth < 900 ? 2 : safeWidth < 1600 ? 3 : 4
        let ceiling: CGFloat = profile == .lite ? 180 : 320
        return RemixMetrics(
            columns: columns,
            heroSize: min(58, max(30, 32 + safeWidth * 0.012)) * scale,
            titleSize: min(34, max(20, 20 + safeWidth * 0.004)) * scale,
            bodySize: min(20, max(13, 12 + safeWidth * 0.002)) * scale,
            coverSize: min(ceiling, max(72, min(safeWidth * 0.22, safeHeight * 0.3))),
            padding: min(34, max(10, 8 + safeWidth * 0.008)),
            gap: min(28, max(8, 8 + safeWidth * 0.006)),
            corner: min(30, max(14, safeWidth * 0.012)),
            maxContentWidth: safeWidth,
            ambientMotion: WavePerformance.allowsAmbientMotion(profile)
        )
    }
}
