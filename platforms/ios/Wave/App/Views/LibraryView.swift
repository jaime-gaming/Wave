import SwiftUI
import WaveCore

struct LibraryView: View {
    @EnvironmentObject private var state: WaveState
    @Binding var importing: Bool
    @State private var section = 0
    @State private var creatingPlaylist = false
    @State private var playlistName = ""
    @State private var playlistToDelete: Playlist?

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
            .alert(WaveTheme.loc("Create playlist"), isPresented: $creatingPlaylist) {
                TextField(WaveTheme.loc("Playlist name"), text: $playlistName)
                Button(WaveTheme.loc("Cancel"), role: .cancel) { playlistName = "" }
                Button(WaveTheme.loc("Create playlist")) {
                    state.createPlaylist(name: playlistName)
                    playlistName = ""
                }
            }
            .confirmationDialog(
                WaveTheme.loc("Delete this playlist? Your songs will remain in your library."),
                isPresented: Binding(get: { playlistToDelete != nil }, set: { if !$0 { playlistToDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button(WaveTheme.loc("Delete"), role: .destructive) {
                    if let playlistToDelete { state.deletePlaylist(playlistToDelete.id) }
                    playlistToDelete = nil
                }
                Button(WaveTheme.loc("Cancel"), role: .cancel) { playlistToDelete = nil }
            }
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
            ForEach(songs) { song in
                SongRow(song: song) { state.play(song) }
                    .listRowBackground(WaveTheme.background)
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
            .listRowBackground(WaveTheme.background)
        }
    }

    @ViewBuilder
    private var artistRows: some View {
        ForEach(WaveLibrary.artists(in: state.songs), id: \.self) { artist in
            NavigationLink(artist) {
                songList(state.songs.filter { $0.artist == artist }, title: artist)
            }
            .foregroundStyle(WaveTheme.text)
            .listRowBackground(WaveTheme.background)
        }
    }

    @ViewBuilder
    private var playlistRows: some View {
        ForEach(state.snapshot.playlists) { playlist in
            NavigationLink(playlist.name) {
                PlaylistDetailView(playlistID: playlist.id)
            }
            .foregroundStyle(WaveTheme.text)
            .listRowBackground(WaveTheme.background)
            .swipeActions(allowsFullSwipe: false) {
                Button(role: .destructive) { playlistToDelete = playlist } label: {
                    Label(WaveTheme.loc("Delete"), systemImage: "trash")
                }
            }
        }
        Button(WaveTheme.loc("Create playlist")) {
            playlistName = ""
            creatingPlaylist = true
        }
        .listRowBackground(WaveTheme.background)
    }

    @ViewBuilder
    private func songList(_ songs: [Song], title: String) -> some View {
        List(songs) { song in
            SongRow(song: song) { state.playSelection(songs, startingAt: song) }
                .listRowBackground(WaveTheme.background)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(WaveTheme.background)
        .navigationTitle(title)
    }
}

/// Resolve the playlist on every update so edits and membership stay in sync.
private struct PlaylistDetailView: View {
    @EnvironmentObject private var state: WaveState
    let playlistID: String

    var body: some View {
        let playlist = state.snapshot.playlists.first { $0.id == playlistID }
        let songs = playlist.map { WaveLibrary.songs(in: $0, from: state.songs) } ?? []
        List {
            if songs.isEmpty {
                Text(WaveTheme.loc("No songs yet"))
                    .foregroundStyle(WaveTheme.muted)
                    .listRowBackground(WaveTheme.background)
            } else {
                ForEach(Array(songs.enumerated()), id: \.offset) { _, song in
                    SongRow(song: song) { state.playSelection(songs, startingAt: song) }
                        .listRowBackground(WaveTheme.background)
                }
                .onDelete { state.removeFromPlaylist(playlistID, at: $0) }
                .onMove { state.moveInPlaylist(playlistID, from: $0, to: $1) }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(WaveTheme.background.ignoresSafeArea())
        .navigationTitle(playlist?.name ?? WaveTheme.loc("Playlists"))
        .toolbar { EditButton() }
    }
}
