import Combine
import SwiftUI
import UniformTypeIdentifiers
import UIKit
import WaveCore

struct NowPlayingView: View {
    @EnvironmentObject private var state: WaveState
    @State private var volume: Double = 1
    @State private var importingLyrics = false
    @State private var editingMetadata = false
    @State private var sharing = false
    @State private var queueOpen = false
    @State private var lyricsOpen = true
    @State private var confirmLyricsLookup = false
    @State private var lyricsLookupRunning = false
    @State private var lyricsLookupMessage: String?
    @State private var idle = false
    @State private var lastInteraction = Date()
    private let idleClock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    @State private var lines: [LyricLine] = []

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

                ScrollView {
                    playerContent(metrics: metrics, width: geometry.size.width, height: geometry.size.height)
                        .frame(minHeight: max(0, geometry.size.height - metrics.padding * 2), alignment: .top)
                        .padding(metrics.padding)
                }
                .scrollIndicators(.hidden)

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
            .onAppear {
                volume = Double(state.player.volume)
                lines = WaveLyrics.displayLines(state.current?.lyrics ?? "")
            }
            .onChange(of: state.current?.lyrics) { _, lyrics in
                lines = WaveLyrics.displayLines(lyrics ?? "")
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
            .alert(WaveTheme.loc("Find lyrics"), isPresented: $confirmLyricsLookup) {
                Button(WaveTheme.loc("Cancel"), role: .cancel) {}
                Button(WaveTheme.loc("Find lyrics")) {
                    guard let song = state.current else { return }
                    lyricsLookupRunning = true
                    Task {
                        do {
                            let found = try await state.findLyrics(for: song)
                            lyricsLookupMessage = WaveTheme.loc(found ? "Lyrics found" : "No lyrics found for this song.")
                        } catch {
                            lyricsLookupMessage = WaveTheme.loc("The lyrics lookup failed.")
                        }
                        lyricsLookupRunning = false
                    }
                }
            } message: {
                Text(WaveTheme.loc("Optional LRCLIB lookup sends song metadata and connection IP, never audio. Saved lyrics work offline. Manual search remains available in song options without starting playback."))
            }
            .alert(WaveTheme.loc("Find lyrics"), isPresented: Binding(
                get: { lyricsLookupMessage != nil },
                set: { if !$0 { lyricsLookupMessage = nil } }
            )) {
                Button(WaveTheme.loc("Close"), role: .cancel) { lyricsLookupMessage = nil }
            } message: {
                Text(lyricsLookupMessage ?? "")
            }
            .alert(WaveTheme.loc("Playback"), isPresented: Binding(
                get: { state.playbackError != nil },
                set: { if !$0 { state.playbackError = nil } }
            )) {
                Button(WaveTheme.loc("Close")) { state.playbackError = nil }
            } message: { Text(state.playbackError ?? "") }
            .sheet(isPresented: $queueOpen) {
                NavigationStack {
                    QueueView()
                        .toolbar { Button(WaveTheme.loc("Close")) { queueOpen = false } }
                }
                .environmentObject(state)
            }
            .sheet(isPresented: $editingMetadata) {
                if let song = state.current {
                    CatalogueView(song: song).environmentObject(state)
                }
            }
            .sheet(isPresented: $sharing) {
                if let song = state.current {
                    WaveShareSheet(song: song, artwork: state.artwork(for: song))
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
    private func playerContent(metrics: RemixMetrics, width: CGFloat, height: CGFloat) -> some View {
        VStack(spacing: metrics.gap) {
            HStack {
                Text(WaveTheme.loc("Now playing"))
                    .font(.title3.bold())
                Spacer()
                Button { queueOpen = true } label: {
                    Image(systemName: "text.line.first.and.arrowtriangle.forward")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(WaveTheme.loc("Open queue"))
                .waveGlassButton()
                Button { state.playerExpanded = false } label: {
                    Image(systemName: "chevron.down")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(WaveTheme.loc("Close"))
                .waveGlassButton()
            }
            if let song = state.current {
                ArtworkView(
                    image: state.artwork(for: song),
                    size: max(96, min(width * 0.53, height * 0.27, 300)),
                    corner: 26
                )
                .padding(.top, 2)
                VStack(spacing: 4) {
                    Text(song.title).font(.title2.bold()).lineLimit(2).multilineTextAlignment(.center)
                    Text(song.artist).font(.body).foregroundStyle(WaveTheme.accent).lineLimit(1)
                    if !song.album.isEmpty {
                        Text(song.album).font(.caption).foregroundStyle(WaveTheme.muted).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity)

                Button { lyricsOpen.toggle() } label: {
                    HStack {
                        Image(systemName: "captions.bubble")
                        Text(WaveTheme.loc("Lyrics"))
                        Spacer()
                        Image(systemName: lyricsOpen ? "chevron.up" : "chevron.down")
                    }
                    .foregroundStyle(WaveTheme.muted)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(WaveTheme.loc(lyricsOpen ? "Lyrics" : "Show lyrics"))
                if lyricsOpen {
                    lyricsView(metrics: metrics)
                        .frame(height: max(60, min(height * 0.12, 100)))
                }
                Spacer(minLength: 0)
                songActions(song)
                transportDeck()
            } else {
                EmptyStateView(
                    title: WaveTheme.loc("No songs yet"),
                    actionTitle: WaveTheme.loc("Close"),
                    action: { state.playerExpanded = false }
                )
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func songActions(_ song: Song) -> some View {
        HStack(spacing: 6) {
            Button { sharing = true } label: {
                Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
            }
            .accessibilityLabel(WaveTheme.loc("Share song"))
            Menu {
                Button(WaveTheme.loc("Find lyrics")) { confirmLyricsLookup = true }
                    .disabled(lyricsLookupRunning)
                Button(WaveTheme.loc("Import lyrics")) { importingLyrics = true }
                Button(WaveTheme.loc("Find song metadata")) { editingMetadata = true }
                Toggle(WaveTheme.loc("Mix"), isOn: Binding(get: { state.mixEnabled }, set: { state.mixEnabled = $0 }))
            } label: {
                Image(systemName: "pencil").frame(width: 44, height: 44)
            }
            .accessibilityLabel(WaveTheme.loc("More options"))
            Spacer()
            Button { state.shuffle.toggle() } label: {
                Image(systemName: "shuffle").frame(width: 44, height: 44)
                    .foregroundStyle(state.shuffle ? WaveTheme.accent : WaveTheme.muted)
            }
            .accessibilityLabel(WaveTheme.loc("Shuffle"))
            .accessibilityValue(state.shuffle ? WaveTheme.loc("On") : WaveTheme.loc("Off"))
            Button { state.toggleFavorite(song) } label: {
                Image(systemName: song.isFavorite ? "heart.fill" : "heart").frame(width: 44, height: 44)
                    .foregroundStyle(song.isFavorite ? WaveTheme.accent : WaveTheme.muted)
            }
            .accessibilityLabel(WaveTheme.loc("Favorites"))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func transportDeck() -> some View {
        VStack(spacing: 6) {
            Slider(value: position, in: 0...max(1, state.duration))
                .tint(WaveTheme.accent)
                .accessibilityLabel(WaveTheme.loc("Song position"))
            HStack {
                Text(format(state.currentTime))
                Spacer()
                Text(format(state.duration))
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(WaveTheme.muted)
            HStack(spacing: 28) {
                Button { state.previous() } label: {
                    Image(systemName: "backward.end.fill").frame(width: 44, height: 44)
                }
                .accessibilityLabel(WaveTheme.loc("Previous"))
                Button { state.togglePlayPause() } label: {
                    Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2.bold())
                        .frame(width: 64, height: 64)
                        .foregroundStyle(WaveTheme.background)
                        .background(WaveTheme.accent, in: Circle())
                }
                .accessibilityLabel(state.isPlaying ? WaveTheme.loc("Pause") : WaveTheme.loc("Play"))
                Button { state.next() } label: {
                    Image(systemName: "forward.end.fill").frame(width: 44, height: 44)
                }
                .accessibilityLabel(WaveTheme.loc("Next"))
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                Image(systemName: volume > 0 ? "speaker.wave.2" : "speaker.slash")
                    .foregroundStyle(WaveTheme.muted)
                Slider(value: $volume, in: 0...1)
                    .tint(WaveTheme.accent)
                    .accessibilityLabel(WaveTheme.loc("Volume"))
                    .onChange(of: volume) { _, value in state.setVolume(Float(value)) }
                Text("\(Int(volume * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(WaveTheme.muted)
            }
        }
        .padding(14)
        .background(WaveTheme.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }


    private func lyricText(_ line: LyricLine, active: Bool) -> Text {
        guard active, !line.words.isEmpty else {
            return Text(line.text.isEmpty ? "♪" : line.text).foregroundColor(active ? WaveTheme.text : WaveTheme.muted)
        }
        return line.words.reduce(Text("")) { result, word in
            result + Text(word.text).foregroundColor(state.currentTime >= word.time ? WaveTheme.text : WaveTheme.muted)
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
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(lines.indices, id: \.self) { index in
                            lyricText(lines[index], active: index == activeLine)
                                .font(
                                    index == activeLine
                                        ? .system(size: metrics.titleSize * 0.9, weight: .bold)
                                        : .system(size: metrics.bodySize)
                                )
                                .accessibilityLabel(lines[index].text)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(index)
                        }
                    }
                    .padding(.vertical)
                }
                .onChange(of: activeLine) { _, index in
                    guard let index else { return }
                    if state.ambientMotion {
                        withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(index, anchor: .center) }
                    } else { proxy.scrollTo(index, anchor: .center) }
                }
            }
        }
    }
}
