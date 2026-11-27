import SwiftUI
import UIKit
import WaveCore






struct ImmersiveIdleView: View {
    @EnvironmentObject private var state: WaveState
    let metrics: RemixMetrics
    let onWake: () -> Void

    @State private var lines: [LyricLine] = []

    private var active: Int? {
        WaveLyrics.activeLine(lines, at: state.currentTime)
    }

    private var progress: Double {
        let duration = max(1, state.duration)
        return min(1, max(0, state.currentTime / duration))
    }

    private func format(_ seconds: TimeInterval) -> String {
        let value = max(0, Int(seconds))
        return String(format: "%d:%02d", value / 60, value % 60)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [WaveTheme.background, WaveTheme.surface, WaveTheme.background],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                if metrics.ambientMotion && state.ambientMotion {
                    Circle()
                        .stroke(WaveTheme.accent.opacity(0.16), lineWidth: 1)
                        .frame(width: geometry.size.width * 0.7, height: geometry.size.width * 0.7)
                }

                waveGlassContainer(spacing: metrics.gap) {
                    VStack(spacing: metrics.gap * 0.7) {
                        if let song = state.current {
                            ArtworkView(
                                image: state.artwork(for: song),
                                size: min(metrics.coverSize, geometry.size.width * 0.62),
                                corner: metrics.corner
                            )
                        }
                        Text(WaveTheme.loc("Now playing"))
                            .font(.system(size: metrics.bodySize * 0.8, weight: .semibold))
                            .foregroundStyle(WaveTheme.accent)
                            .textCase(.uppercase)
                        if let song = state.current {
                            Text(song.title)
                                .font(.system(size: metrics.titleSize, weight: .bold))
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                                .minimumScaleFactor(0.7)
                            Text(song.artist)
                                .font(.system(size: metrics.bodySize))
                                .foregroundStyle(WaveTheme.muted)
                                .lineLimit(1)
                            if !song.album.isEmpty {
                                Text(song.album)
                                    .font(.system(size: metrics.bodySize * 0.8))
                                    .foregroundStyle(WaveTheme.muted.opacity(0.8))
                                    .lineLimit(1)
                            }
                            if state.mixEnabled {
                                Label(WaveTheme.loc("Mix"), systemImage: "waveform.path.ecg")
                                    .font(.system(size: metrics.bodySize * 0.8))
                                    .foregroundStyle(WaveTheme.accent)
                            }
                            if let active, active < lines.count {
                                Text(lines[active].text.isEmpty ? "♪" : lines[active].text)
                                    .font(.system(size: metrics.titleSize * 0.86, weight: .semibold))
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                                    .padding(.top, metrics.gap * 0.3)
                            }
                        }
                        Text("\(format(state.currentTime)) / \(format(state.duration))  −\(format(max(0, state.duration - state.currentTime)))")
                            .font(.system(size: metrics.bodySize * 0.8).monospacedDigit())
                            .foregroundStyle(WaveTheme.muted)
                        ProgressView(value: progress)
                            .tint(WaveTheme.accent)
                            .frame(maxWidth: min(geometry.size.width * 0.8, 620))
                    }
                    .padding(metrics.padding * 1.4)
                    .frame(maxWidth: min(geometry.size.width - metrics.padding * 2, metrics.maxContentWidth))
                    .waveGlass(cornerRadius: metrics.corner)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(WaveTheme.text)
            .contentShape(Rectangle())
            .onTapGesture(perform: onWake)
            .accessibilityLabel(WaveTheme.loc("Immersive listening"))
            .onAppear { lines = WaveLyrics.displayLines(state.current?.lyrics ?? "") }
            .onChange(of: state.current?.lyrics) { _, lyrics in
                lines = WaveLyrics.displayLines(lyrics ?? "")
            }
        }
    }
}
