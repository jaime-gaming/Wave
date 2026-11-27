import SwiftUI
import WaveCore

struct HomeView: View {
    @EnvironmentObject private var state: WaveState
    @Binding var importing: Bool
    @Environment(\.scenePhase) private var scenePhase
    @State private var day = Date()
    @State private var selectedMix: DailySelection?
    @State private var selectedAlbum: AlbumGroup?

    private struct DailySelection: Identifiable {
        let id = UUID()
        let number: Int
        let songs: [Song]
    }

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

                    collectionOverview

                    if state.songs.isEmpty {
                        EmptyStateView(
                            title: WaveTheme.loc("No songs yet"),
                            actionTitle: WaveTheme.loc("Import music"),
                            action: { importing = true }
                        )
                    } else {
                        dailyMixes
                        recentAlbums
                        section(WaveTheme.loc("Recently added"), songs: recent)
                        if !favorites.isEmpty {
                            section(WaveTheme.loc("Favorites"), songs: Array(favorites.prefix(12)))
                        }
                    }
                }
            }
            .background(WaveTheme.background.ignoresSafeArea())
            .onChange(of: scenePhase) { _, phase in if phase == .active { day = Date() } }
            .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in day = Date() }
            .sheet(item: $selectedMix) { selection in
                DailyMixDetail(number: selection.number, songs: selection.songs)
                    .environmentObject(state)
            }
            .sheet(item: $selectedAlbum) { album in
                AlbumDetail(album: album).environmentObject(state)
            }
        }
    }

    private var collectionOverview: some View {
        let shortcuts: [(LibrarySection, String, String, Int)] = [
            (.songs, "Songs", "music.note", state.songs.count),
            (.albums, "Albums", "square.stack", WaveLibrary.albumGroups(in: state.songs).count),
            (.artists, "Artists", "person.2", WaveLibrary.artists(in: state.songs).count),
            (.playlists, "Playlists", "music.note.list", state.snapshot.playlists.count),
            (.favorites, "Favorites", "heart", favorites.count)
        ]
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(WaveTheme.loc("Your collection"))
                    .font(.title3.bold())
                    .foregroundStyle(WaveTheme.text)
                Spacer(minLength: 8)
                Button { importing = true } label: {
                    Label(WaveTheme.loc("Add music"), systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(WaveTheme.surfaceRaised, in: Capsule())
                }
                .buttonStyle(.plain)
                .foregroundStyle(WaveTheme.text)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 8)], spacing: 8) {
                ForEach(shortcuts, id: \.0) { section, label, icon, count in
                    Button { state.openLibrary(section) } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Image(systemName: icon).foregroundStyle(WaveTheme.accent)
                                Spacer(minLength: 4)
                                Text("\(count)").font(.title3.bold()).foregroundStyle(WaveTheme.text)
                            }
                            Text(WaveTheme.loc(label))
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(WaveTheme.muted)
                                .lineLimit(2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
                        .background(section == .songs ? WaveTheme.accent.opacity(0.16) : WaveTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(WaveTheme.loc(label)), \(count)")
                }
            }
        }
        .padding(.horizontal)
    }

    @ViewBuilder
    private var recentAlbums: some View {
        let albums = WaveLibrary.albumGroups(in: state.songs).sorted {
            ($0.songs.map(\.addedAt).max() ?? .distantPast) > ($1.songs.map(\.addedAt).max() ?? .distantPast)
        }
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(WaveTheme.loc("Recently added albums"))
                        .font(.title3.bold()).foregroundStyle(WaveTheme.text)
                    Spacer()
                    Button(WaveTheme.loc("All albums")) { state.openLibrary(.albums) }
                        .font(.subheadline.weight(.semibold))
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(Array(albums.prefix(6))) { album in
                            Button { selectedAlbum = album } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    let cover = album.songs.first(where: { $0.artworkName != nil }) ?? album.songs.first
                                    ArtworkView(image: cover.flatMap { state.artwork(for: $0) }, size: 130, corner: 14)
                                    Text(album.title.isEmpty ? WaveTheme.loc("Unknown album") : album.title)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(WaveTheme.text).lineLimit(2)
                                    Text(album.artist).font(.caption).foregroundStyle(WaveTheme.muted).lineLimit(1)
                                }
                                .frame(width: 130, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal)
        }
    }

    @ViewBuilder
    private var dailyMixes: some View {
        let mixes = WaveLibrary.dailyMixes(state.songs, day: day)
        if !mixes.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(WaveTheme.loc("Daily Mix"))
                    .font(.title3.bold())
                    .foregroundStyle(WaveTheme.text)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(Array(mixes.enumerated()), id: \.offset) { index, songs in
                            Button {
                                selectedMix = DailySelection(number: index + 1, songs: songs)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    if let first = songs.first {
                                        ArtworkView(image: state.artwork(for: first), size: 130, corner: 14)
                                    }
                                    Text("\(WaveTheme.loc("Daily Mix")) \(index + 1)")
                                        .font(.headline)
                                    Text(songs.prefix(3).map(\.artist).joined(separator: ", "))
                                        .font(.caption)
                                        .lineLimit(2)
                                        .foregroundStyle(WaveTheme.muted)
                                }
                                .frame(width: 150, alignment: .leading)
                                .padding(12)
                                .background(WaveTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 18))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal)
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
                SongRow(song: song) { state.playSelection(songs, startingAt: song) }
                    .padding(.horizontal)
            }
        }
    }
}


private struct DailyMixDetail: View {
    @EnvironmentObject private var state: WaveState
    @Environment(\.dismiss) private var dismiss
    let number: Int
    let songs: [Song]
    @State private var saved = false

    private var title: String { "\(WaveTheme.loc("Daily Mix")) \(number)" }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Button(WaveTheme.loc("Play")) { state.playSelection(songs); dismiss() }
                            Button(WaveTheme.loc("Shuffle")) {
                                let shuffled = songs.shuffled()
                                state.playSelection(shuffled)
                                dismiss()
                            }
                        }
                        Button(WaveTheme.loc(saved ? "Saved" : "Save as playlist")) {
                            state.saveDailyMix(songs, name: title)
                            saved = true
                        }.disabled(saved)
                    }
                    .buttonStyle(.bordered)
                    .tint(WaveTheme.accent)
                }
                ForEach(songs) { song in
                    SongRow(song: song) { state.playSelection(songs, startingAt: song); dismiss() }
                        .listRowBackground(WaveTheme.background)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(WaveTheme.background.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button(WaveTheme.loc("Close")) { dismiss() } }
        }
    }
}

private struct AlbumDetail: View {
    @EnvironmentObject private var state: WaveState
    @Environment(\.dismiss) private var dismiss
    let album: AlbumGroup

    var body: some View {
        NavigationStack {
            List(album.songs) { song in
                SongRow(song: song) {
                    state.playSelection(album.songs, startingAt: song)
                    dismiss()
                }
                .listRowBackground(WaveTheme.background)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(WaveTheme.background.ignoresSafeArea())
            .navigationTitle(album.title.isEmpty ? WaveTheme.loc("Unknown album") : album.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button(WaveTheme.loc("Close")) { dismiss() } }
        }
    }
}
