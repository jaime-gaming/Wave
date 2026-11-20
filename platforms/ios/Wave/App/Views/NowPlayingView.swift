import Combine
import SwiftUI
import UniformTypeIdentifiers
import UIKit
import WaveCore

struct NowPlayingView: View {
    @EnvironmentObject private var state: WaveState
    @State private var volume: Double = 1
    @State private var importingLyrics = false
    @State private var sharing = false
    @State private var idle = false
    @State private var lastInteraction = Date()
    private let idleClock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var lines: [LyricLine] {
        WaveLyrics.displayLines(state.current?.lyrics ?? "")
    }

    private var activeLine: Int? {
        WaveLyrics.activeLine(lines, at: state.currentTime)
    }

    private var position: Binding<Double> {
        Binding(
            get: { state.currentTime },
            set: { state.seek($0) }
        )
    }

    private func fontScale() -> CGFloat {
        UIFontMetrics.default.scaledValue(for: 17) / 17
    }

    private func wake() {
        lastInteraction = Date()
        idle = false
    }

    private func format(_ seconds: TimeInterval) -> String {
        let value = max(0, Int(seconds))
        return String(format: "%d:%02d", value / 60, value % 60)
    }

    var body: some View {
        GeometryReader { geometry in
            let metrics = WaveLayout.metrics(
                width: geometry.size.width,
                height: geometry.size.height,
                fontScale: fontScale(),
                profile: state.profile
            )
            ZStack {
                LinearGradient(
                    colors: [WaveTheme.background, WaveTheme.surface, WaveTheme.background],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                VStack(spacing: metrics.gap) {
                    HStack {
                        Text(WaveTheme.loc("Now playing"))
                            .font(.system(size: metrics.bodySize * 0.8, weight: .semibold))
                            .foregroundStyle(WaveTheme.muted)
                            .textCase(.uppercase)
                        Spacer()
                        Button(WaveTheme.loc("Close")) { state.playerExpanded = false }
                            .waveGlassButton()
                    }

                    if let song = state.current {
                        ArtworkView(
                            image: state.artwork(for: song),
                            size: min(metrics.coverSize, geometry.size.width - metrics.padding * 2),
                            corner: metrics.corner
                        )
                        .shadow(color: WaveTheme.accent.opacity(state.ambientMotion ? 0.22 : 0.1), radius: 30)

                        VStack(spacing: 5) {
                            Text(song.title)
                                .font(.system(size: metrics.titleSize, weight: .bold))
                                .minimumScaleFactor(0.7)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
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
                        }

                        lyricsView(metrics: metrics)
                            .frame(maxHeight: .infinity)

                        VStack(spacing: 8) {
                            Slider(value: position, in: 0...max(1, state.duration))
                                .tint(WaveTheme.accent)
                            HStack {
                                Text(format(state.currentTime))
                                Spacer()
                                Text("−\(format(max(0, state.duration - state.currentTime)))")
                            }
                            .font(.system(size: metrics.bodySize * 0.75).monospacedDigit())
                            .foregroundStyle(WaveTheme.muted)
                        }

                        waveGlassContainer(spacing: metrics.gap) {
                            HStack(spacing: metrics.gap * 1.8) {
                                Button { state.previous() } label: {
                                    Image(systemName: "backward.fill").font(.system(size: metrics.titleSize))
                                }
                                .accessibilityLabel(WaveTheme.loc("Previous"))
                                .waveGlassButton()
                                Button { state.togglePlayPause() } label: {
                                    Image(systemName: state.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                        .font(.system(size: metrics.heroSize))
                                }
                                .accessibilityLabel(state.isPlaying ? WaveTheme.loc("Pause") : WaveTheme.loc("Play"))
                                .waveGlassButton()
                                Button { state.next() } label: {
                                    Image(systemName: "forward.fill").font(.system(size: metrics.titleSize))
                                }
                                .accessibilityLabel(WaveTheme.loc("Next"))
                                .waveGlassButton()
                            }
                        }

                        waveGlassContainer(spacing: metrics.gap) {
                            HStack(spacing: metrics.gap) {
                                Toggle(
                                    WaveTheme.loc("Mix"),
                                    isOn: Binding(
                                        get: { state.mixEnabled },
                                        set: { state.mixEnabled = $0 }
                                    )
                                )
                                .toggleStyle(.switch)
                                .tint(WaveTheme.accent)
                                .font(.system(size: metrics.bodySize * 0.75))
                                Image(systemName: "speaker.fill")
                                    .font(.system(size: metrics.bodySize * 0.75))
                                    .foregroundStyle(WaveTheme.muted)
                                Slider(value: $volume, in: 0...1)
                                    .tint(WaveTheme.accent)
                                    .accessibilityLabel(WaveTheme.loc("Volume"))
                                    .onChange(of: volume) { _, value in
                                        state.setVolume(Float(value))
                                    }
                                Button {
                                    state.toggleFavorite(song)
                                } label: {
                                    Image(systemName: song.isFavorite ? "heart.fill" : "heart")
                                        .font(.system(size: metrics.bodySize))
                                }
                                .accessibilityLabel(WaveTheme.loc("Favorites"))
                                .waveGlassButton()
                                Button {
                                    sharing = true
                                } label: {
                                    Image(systemName: "square.and.arrow.up")
                                        .font(.system(size: metrics.bodySize))
                                }
                                .accessibilityLabel(WaveTheme.loc("Share song"))
                                .waveGlassButton()
                                Button {
                                    importingLyrics = true
                                } label: {
                                    Image(systemName: "text.badge.plus")
                                        .font(.system(size: metrics.bodySize))
                                }
                                .accessibilityLabel(WaveTheme.loc("Import lyrics"))
                                .waveGlassButton()
                            }
                        }
                    } else {
                        EmptyStateView(
                            title: WaveTheme.loc("No songs yet"),
                            actionTitle: WaveTheme.loc("Close"),
                            action: { state.playerExpanded = false }
                        )
                    }
                }
                .padding(metrics.padding)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if idle && state.isPlaying {
                    ImmersiveIdleView(metrics: metrics, onWake: wake)
                        .environmentObject(state)
                        .transition(.opacity)
                }
            }
            .foregroundStyle(WaveTheme.text)
            .contentShape(Rectangle())
            .onTapGesture(perform: wake)
            .onReceive(idleClock) { now in
                if state.isPlaying && now.timeIntervalSince(lastInteraction) >= 30 {
                    idle = true
                }
            }
            .onChange(of: state.isPlaying) { _, playing in
                lastInteraction = Date()
                if !playing { idle = false }
            }
            .onChange(of: state.currentID) { _, _ in
                lastInteraction = Date()
                idle = false
            }
            .animation(state.ambientMotion ? .easeInOut(duration: 0.35) : nil, value: idle)
            .sheet(isPresented: $sharing) {
                if let song = state.current {
                    WaveShareSheet(song: song, url: state.shareURL(for: song))
                }
            }
            .fileImporter(
                isPresented: $importingLyrics,
                allowedContentTypes: [UTType(filenameExtension: "lrc") ?? .plainText],
                allowsMultipleSelection: false
            ) { result in
                if let url = try? result.get().first { state.importLyrics(from: url) }
            }
        }
    }

    @ViewBuilder
    private func lyricsView(metrics: RemixMetrics) -> some View {
        if lines.isEmpty {
            VStack {
                Image(systemName: "music.note")
                    .font(.system(size: metrics.heroSize))
                    .foregroundStyle(WaveTheme.muted.opacity(0.5))
                Text(WaveTheme.loc("Lyrics"))
                    .font(.system(size: metrics.bodySize * 0.85))
                    .foregroundStyle(WaveTheme.muted)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(lines.indices, id: \.self) { index in
                        Text(lines[index].text.isEmpty ? "♪" : lines[index].text)
                            .font(
                                index == activeLine
                                    ? .system(size: metrics.titleSize * 0.9, weight: .bold)
                                    : .system(size: metrics.bodySize)
                            )
                            .foregroundStyle(index == activeLine ? WaveTheme.text : WaveTheme.muted)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                            .animation(state.ambientMotion ? .easeInOut(duration: 0.25) : nil, value: activeLine)
                    }
                }
                .padding(.vertical)
            }
        }
    }
}
