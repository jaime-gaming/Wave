import SwiftUI
import WaveCore

struct SearchView: View {
    @EnvironmentObject private var state: WaveState
    @State private var query = ""

    private var results: [Song] {
        WaveLibrary.search(WaveLibrary.sorted(state.songs, by: .title), query: query)
    }

    var body: some View {
        NavigationStack {
            List {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Section(WaveTheme.loc("Recently added")) {
                        ForEach(WaveLibrary.sorted(state.songs, by: .added).prefix(8)) { song in
                            SongRow(song: song) { state.play(song) }
                        }
                    }
                } else {
                    ForEach(results.prefix(state.rowsPerPage)) { song in
                        SongRow(song: song) { state.play(song) }
                    }
                    if results.isEmpty {
                        Text(WaveTheme.loc("No songs yet"))
                            .foregroundStyle(WaveTheme.muted)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(WaveTheme.background.ignoresSafeArea())
            .searchable(text: $query, prompt: WaveTheme.loc("Search your music"))
            .navigationTitle(WaveTheme.loc("Search"))
        }
    }
}
