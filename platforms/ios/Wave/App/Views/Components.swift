import SwiftUI
import UIKit
import WaveCore

private func waveScreenMetrics() -> RemixMetrics {
    let bounds = UIScreen.main.bounds
    let scale = UIFontMetrics.default.scaledValue(for: 17) / 17
    return WaveLayout.metrics(width: bounds.width, height: bounds.height, fontScale: scale)
}

/// The small pieces every page shares. Icons are SF Symbols here; the web and
/// the two desktop/mobile natives draw Wave's own line-art glyphs.
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
    @EnvironmentObject private var state: WaveState
    let song: Song
    let onPlay: () -> Void

    var body: some View {
        let metrics = waveScreenMetrics()
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
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(WaveTheme.loc("Play"))
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
    let title: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        let metrics = waveScreenMetrics()
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
    let title: String
    var body: some View {
        let metrics = waveScreenMetrics()
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
