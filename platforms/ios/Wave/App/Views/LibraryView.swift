import SwiftUI
import WaveCore

struct LibraryView: View {
    @EnvironmentObject private var state: WaveState
    @Binding var importing: Bool
    @State private var section = 0

    private var sections: [String] {
        [WaveTheme.loc("Songs"), WaveTheme.loc("Albums"), WaveTheme.loc("Artists"), WaveTheme.loc("Playlists")]
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                PageHeader(title: WaveTheme.loc("Library"))
                Picker("", selection: $section) {
                    ForEach(sections.indices, id: \.self) { index in
                        Text(sections[index]).tag(index)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                List {
                    switch section {
                    case 0: songRows
                    case 1: albumRows
                    case 2: artistRows
                    default: playlistRows
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
            .background(WaveTheme.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { importing = true } label: {
                        Label(WaveTheme.loc("Add music"), systemImage: "plus")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var songRows: some View {
        let songs = WaveLibrary.sorted(state.songs, by: .title)
        if songs.isEmpty {
            EmptyStateView(
                title: WaveTheme.loc("No songs yet"),
                actionTitle: WaveTheme.loc("Import music"),
                action: { importing = true }
            )
        } else {
            ForEach(songs.prefix(state.rowsPerPage)) { song in
                SongRow(song: song) { state.play(song) }
                    .swipeActions {
                        Button { state.enqueue(song) } label: {
                            Label(WaveTheme.loc("Add to queue"), systemImage: "text.badge.plus")
                        }
                        .tint(WaveTheme.accent)
                        Button { state.toggleFavorite(song) } label: {
                            Label(WaveTheme.loc("Favorites"), systemImage: "heart")
                        }
                        .tint(.pink)
                    }
            }
        }
    }

    @ViewBuilder
    private var albumRows: some View {
        ForEach(WaveLibrary.albums(in: state.songs), id: \.self) { album in
            NavigationLink(album) {
                songList(state.songs.filter { $0.album == album }, title: album)
            }
            .foregroundStyle(WaveTheme.text)
        }
    }

    @ViewBuilder
    private var artistRows: some View {
        ForEach(WaveLibrary.artists(in: state.songs), id: \.self) { artist in
            NavigationLink(artist) {
                songList(state.songs.filter { $0.artist == artist }, title: artist)
            }
            .foregroundStyle(WaveTheme.text)
        }
    }

    @ViewBuilder
    private var playlistRows: some View {
        ForEach(state.snapshot.playlists) { playlist in
            NavigationLink(playlist.name) {
                songList(WaveLibrary.songs(in: playlist, from: state.songs), title: playlist.name)
            }
            .foregroundStyle(WaveTheme.text)
        }
        Button(WaveTheme.loc("Create playlist")) {
            state.createPlaylist(name: WaveTheme.loc("New playlist"))
        }
    }

    @ViewBuilder
    private func songList(_ songs: [Song], title: String) -> some View {
        List(songs) { song in
            SongRow(song: song) { state.play(song) }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(WaveTheme.background)
        .navigationTitle(title)
    }
}
