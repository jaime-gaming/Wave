import SwiftUI
import WaveCore

struct PlayerBar: View {
    @EnvironmentObject private var state: WaveState

    var body: some View {
        HStack(spacing: 12) {
            ArtworkView(image: state.current.flatMap { state.artwork(for: $0) }, size: 44, corner: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(state.current?.title ?? "Wave")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(state.current?.artist ?? "")
                    .font(.caption)
                    .foregroundStyle(WaveTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            Button {
                state.togglePlayPause()
            } label: {
                Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(state.isPlaying ? WaveTheme.loc("Pause") : WaveTheme.loc("Play"))
            Button {
                state.next()
            } label: {
                Image(systemName: "forward.fill")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(WaveTheme.loc("Next"))
        }
        .padding(10)
        .waveGlass(cornerRadius: 16)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(WaveTheme.accent.opacity(0.18), lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { state.playerExpanded = true }
        .accessibilityAddTraits(.isButton)
    }
}
