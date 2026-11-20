import SwiftUI
import WaveCore

struct HomeView: View {
    @EnvironmentObject private var state: WaveState
    @Binding var importing: Bool

    private var recent: [Song] {
        Array(WaveLibrary.sorted(state.songs, by: .added).prefix(state.rowsPerPage))
    }

    private var favorites: [Song] {
        state.songs.filter(\.isFavorite)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    PageHeader(title: WaveTheme.loc("Home"))

                    Button {
                        importing = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                            Text(WaveTheme.loc("Add music"))
                                .font(.headline)
                            Spacer()
                        }
                        .padding()
                        .background(WaveTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    if state.songs.isEmpty {
                        EmptyStateView(
                            title: WaveTheme.loc("No songs yet"),
                            actionTitle: WaveTheme.loc("Import music"),
                            action: { importing = true }
                        )
                    } else {
                        section(WaveTheme.loc("Recently added"), songs: recent)
                        if !favorites.isEmpty {
                            section(WaveTheme.loc("Favorites"), songs: Array(favorites.prefix(12)))
                        }
                    }
                }
                .padding(.bottom, 140)
            }
            .background(WaveTheme.background.ignoresSafeArea())
        }
    }

    @ViewBuilder
    private func section(_ title: String, songs: [Song]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.title3.bold())
                .foregroundStyle(WaveTheme.text)
                .padding(.horizontal)
            ForEach(songs) { song in
                SongRow(song: song) { state.play(song) }
                    .padding(.horizontal)
            }
        }
    }
}
