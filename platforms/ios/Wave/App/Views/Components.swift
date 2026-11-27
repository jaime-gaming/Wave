import SwiftUI
import UIKit
import WaveCore


private struct WaveWindowSizeKey: EnvironmentKey {
    static let defaultValue: CGSize = .zero
}
extension EnvironmentValues {
    var waveWindowSize: CGSize {
        get { self[WaveWindowSizeKey.self] }
        set { self[WaveWindowSizeKey.self] = newValue }
    }
}
private func waveScreenMetrics(_ windowSize: CGSize) -> RemixMetrics {
    let bounds = UIScreen.main.bounds
    let size = windowSize.width > 0 && windowSize.height > 0 ? windowSize : bounds.size
    let scale = UIFontMetrics.default.scaledValue(for: 17) / 17
    return WaveLayout.metrics(width: size.width, height: size.height, fontScale: scale)
}



struct ArtworkView: View {
    let image: UIImage?
    var size: CGFloat = 48
    var corner: CGFloat = 10

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    WaveTheme.surfaceRaised
                    Image(systemName: "waveform")
                        .foregroundStyle(WaveTheme.accent.opacity(0.8))
                        .font(.system(size: size * 0.4))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    }
}

struct SongRow: View {
    @Environment(\.waveWindowSize) private var windowSize
    @EnvironmentObject private var state: WaveState
    let song: Song
    let onPlay: () -> Void

    var body: some View {
        let metrics = waveScreenMetrics(windowSize)
        HStack(spacing: metrics.gap * 0.6) {
            ArtworkView(
                image: state.artwork(for: song),
                size: min(64, max(40, metrics.coverSize * 0.28)),
                corner: metrics.corner * 0.4
            )
            VStack(alignment: .leading, spacing: 3) {
                Text(song.title)
                    .font(.system(size: metrics.titleSize * 0.78, weight: .semibold))
                    .foregroundStyle(WaveTheme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(song.artist)
                    .font(.system(size: metrics.bodySize * 0.8))
                    .foregroundStyle(WaveTheme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 8)
            if song.isFavorite {
                Image(systemName: "heart.fill")
                    .foregroundStyle(WaveTheme.accent)
                    .font(.system(size: metrics.bodySize * 0.8))
            }
            Button(action: onPlay) {
                Image(systemName: "play.fill")
                    .font(.system(size: metrics.bodySize * 0.8))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(WaveTheme.loc("Play {title} by {artist}")
                .replacingOccurrences(of: "{title}", with: song.title)
                .replacingOccurrences(of: "{artist}", with: song.artist))
        }
        .padding(.vertical, metrics.gap * 0.35)
        .contentShape(Rectangle())
        .onTapGesture(perform: onPlay)
        .contextMenu {
            Button { state.enqueue(song) } label: {
                Label(WaveTheme.loc("Add to queue"), systemImage: "text.badge.plus")
            }
            Button { state.toggleFavorite(song) } label: {
                Label(WaveTheme.loc("Favorites"), systemImage: song.isFavorite ? "heart.slash" : "heart")
            }
            if !state.snapshot.playlists.isEmpty {
                Menu(WaveTheme.loc("Add to playlist")) {
                    ForEach(state.snapshot.playlists) { playlist in
                        Button(playlist.name) { state.addToPlaylist(playlist.id, songID: song.id) }
                            .disabled(playlist.songIDs.contains(song.id))
                    }
                }
            }
        }
    }
}

struct EmptyStateView: View {
    @Environment(\.waveWindowSize) private var windowSize
    let title: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        let metrics = waveScreenMetrics(windowSize)
        VStack(spacing: metrics.gap) {
            Image(systemName: "music.note.list")
                .font(.system(size: metrics.heroSize))
                .foregroundStyle(WaveTheme.accent.opacity(0.7))
            Text(title)
                .font(.system(size: metrics.titleSize * 0.9, weight: .semibold))
                .foregroundStyle(WaveTheme.muted)
                .multilineTextAlignment(.center)
            Button(actionTitle, action: action)
                .font(.system(size: metrics.bodySize, weight: .semibold))
                .buttonStyle(.borderedProminent)
                .tint(WaveTheme.accent)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(metrics.padding)
    }
}

struct PageHeader: View {
    @Environment(\.waveWindowSize) private var windowSize
    let title: String
    var body: some View {
        let metrics = waveScreenMetrics(windowSize)
        Text(title)
            .font(.system(size: metrics.heroSize * 0.8, weight: .bold))
            .minimumScaleFactor(0.7)
            .lineLimit(2)
            .foregroundStyle(WaveTheme.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, metrics.padding)
            .padding(.top, metrics.padding * 0.6)
    }
}
