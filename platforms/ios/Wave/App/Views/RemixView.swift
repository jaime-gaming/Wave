import SwiftUI
import UIKit
import WaveCore

private struct RemixCard: Identifiable {
    let id: String
    let title: String
    let value: String
    let detail: String
    let systemImage: String
}

/// The adaptive Remix page.
///
/// It fills the whole safe width from a 320-point phone to a 4K iPad window:
/// there is no centred design cap and therefore no dead strip of background on
/// the right. Columns, type, artwork and spacing are what change with the
/// screen and the automatic performance profile.
struct RemixView: View {
    @EnvironmentObject private var state: WaveState
    @State private var period: RemixPeriod = .weekly

    private func fontScale() -> CGFloat {
        UIFontMetrics.default.scaledValue(for: 17) / 17
    }

    private func format(_ seconds: TimeInterval) -> String {
        let value = max(0, Int(seconds))
        return value >= 3600
            ? String(format: "%d:%02d:%02d", value / 3600, (value % 3600) / 60, value % 60)
            : String(format: "%d:%02d", value / 60, value % 60)
    }

    var body: some View {
        GeometryReader { geometry in
            let metrics = WaveLayout.metrics(
                width: geometry.size.width,
                height: geometry.size.height,
                fontScale: fontScale(),
                profile: state.profile
            )
            let contentWidth = min(geometry.size.width, metrics.maxContentWidth)
            let recap = WaveRecap.summarize(
                songs: state.songs,
                history: state.snapshot.history,
                period: period
            )
            let songs = Array(recap.songs.prefix(state.rowsPerPage))
            let cards = [
                RemixCard(
                    id: "time",
                    title: WaveTheme.loc("Listening time"),
                    value: format(recap.seconds),
                    detail: "\(recap.plays) \(WaveTheme.loc("Plays"))",
                    systemImage: "clock.fill"
                ),
                RemixCard(
                    id: "song",
                    title: WaveTheme.loc("Top song"),
                    value: recap.topSongs.first?.song.title ?? "—",
                    detail: WaveTheme.loc("Most played"),
                    systemImage: "music.note"
                ),
                RemixCard(
                    id: "artist",
                    title: WaveTheme.loc("Top artist"),
                    value: recap.topArtists.first?.name ?? "—",
                    detail: "\(recap.artists) \(WaveTheme.loc("Unique artists"))",
                    systemImage: "person.fill"
                ),
                RemixCard(
                    id: "week",
                    title: WaveTheme.loc(period.rawValue.capitalized),
                    value: "\(recap.tracks)",
                    detail: WaveTheme.loc("Songs"),
                    systemImage: "chart.bar.fill"
                ),
            ]

            ScrollView {
                VStack(alignment: .leading, spacing: metrics.gap) {
                    Text(WaveTheme.loc("Remix"))
                        .font(.system(size: metrics.heroSize, weight: .bold))
                        .minimumScaleFactor(0.7)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(
                        period == .weekly
                            ? WaveTheme.loc("The songs you played this week")
                            : period == .monthly
                                ? WaveTheme.loc("The songs that shaped your month")
                                : WaveTheme.loc("Your full year in music")
                    )
                    .font(.system(size: metrics.bodySize))
                    .foregroundStyle(WaveTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)

                    waveGlassContainer(spacing: metrics.gap) {
                        Picker("", selection: $period) {
                            ForEach(RemixPeriod.allCases, id: \.self) { value in
                                Text(WaveTheme.loc(value.rawValue.capitalized)).tag(value)
                            }
                        }
                        .pickerStyle(.segmented)
                        .waveGlass(cornerRadius: metrics.corner)
                    }

                    if recap.plays == 0 {
                        EmptyStateView(
                            title: WaveTheme.loc("No plays yet"),
                            actionTitle: WaveTheme.loc("Play"),
                            action: {
                                if let first = WaveLibrary.sorted(state.songs, by: .added).first {
                                    state.play(first)
                                }
                            }
                        )
                        .waveGlass(cornerRadius: metrics.corner)
                    } else {
                        waveGlassContainer(spacing: metrics.gap) {
                            LazyVGrid(
                                columns: Array(
                                    repeating: GridItem(.flexible(minimum: 140), spacing: metrics.gap),
                                    count: metrics.columns
                                ),
                                spacing: metrics.gap
                            ) {
                                ForEach(cards) { card in
                                    VStack(alignment: .leading, spacing: 8) {
                                        Label(card.title, systemImage: card.systemImage)
                                            .font(.system(size: metrics.bodySize * 0.9, weight: .semibold))
                                            .foregroundStyle(WaveTheme.accent)
                                            .lineLimit(1)
                                        Text(card.value)
                                            .font(.system(size: metrics.titleSize, weight: .bold))
                                            .minimumScaleFactor(0.65)
                                            .lineLimit(2)
                                        Text(card.detail)
                                            .font(.system(size: metrics.bodySize * 0.8))
                                            .foregroundStyle(WaveTheme.muted)
                                            .lineLimit(2)
                                    }
                                    .padding(metrics.padding)
                                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
                                    .waveGlass(cornerRadius: metrics.corner)
                                }
                            }
                        }

                        if let hero = recap.topSongs.first?.song {
                            HStack(spacing: metrics.gap) {
                                ArtworkView(
                                    image: state.artwork(for: hero),
                                    size: min(metrics.coverSize, contentWidth * 0.3),
                                    corner: metrics.corner
                                )
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(WaveTheme.loc("Most played"))
                                        .font(.system(size: metrics.bodySize * 0.8))
                                        .foregroundStyle(WaveTheme.muted)
                                    Text(hero.title)
                                        .font(.system(size: metrics.titleSize, weight: .bold))
                                        .lineLimit(2)
                                    Text(hero.artist)
                                        .font(.system(size: metrics.bodySize))
                                        .foregroundStyle(WaveTheme.muted)
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                        }

                        VStack(alignment: .leading, spacing: metrics.gap * 0.6) {
                            HStack {
                                Text(WaveTheme.loc("Your Remix"))
                                    .font(.system(size: metrics.titleSize, weight: .bold))
                                Spacer()
                                Text("\(songs.count) \(WaveTheme.loc("Songs"))")
                                    .font(.system(size: metrics.bodySize * 0.8))
                                    .foregroundStyle(WaveTheme.muted)
                            }
                            waveGlassContainer(spacing: metrics.gap) {
                                HStack(spacing: metrics.gap) {
                                    Button {
                                        state.playRemix()
                                    } label: {
                                        Label(WaveTheme.loc("Play Remix"), systemImage: "play.fill")
                                            .font(.system(size: metrics.bodySize, weight: .semibold))
                                            .frame(maxWidth: .infinity)
                                    }
                                    .waveGlassButton()
                                    Button {
                                        state.saveRemix()
                                    } label: {
                                        Label(WaveTheme.loc("Save as playlist"), systemImage: "square.and.arrow.down")
                                            .font(.system(size: metrics.bodySize, weight: .semibold))
                                            .frame(maxWidth: .infinity)
                                    }
                                    .waveGlassButton()
                                }
                            }
                            ForEach(songs.indices, id: \.self) { index in
                                let song = songs[index]
                                HStack(spacing: 8) {
                                    Text("\(index + 1)")
                                        .font(.system(size: metrics.bodySize * 0.85, weight: .bold))
                                        .foregroundStyle(WaveTheme.accent)
                                        .frame(width: 26, alignment: .leading)
                                    SongRow(song: song) { state.play(song) }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, metrics.padding)
                .padding(.vertical, metrics.padding)
                .frame(width: contentWidth, alignment: .leading)
            }
            .background(WaveTheme.background.ignoresSafeArea())
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
