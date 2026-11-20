import SwiftUI
import WebKit
import WaveCore

private struct OnlineVideo: Decodable, Identifiable {
    let videoId: String
    let title: String
    let author: String
    var id: String { videoId }
}

private struct OnlineSearchResponse: Decodable {
    let items: [OnlineVideo]
}

struct SearchView: View {
    @EnvironmentObject private var state: WaveState
    @State private var query = ""
    @State private var onlineResults: [OnlineVideo] = []
    @State private var selectedVideo: OnlineVideo?
    @State private var showOnlineNotice = false
    @State private var searchingOnline = false
    @State private var onlineMessage: String?

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
                    Section(WaveTheme.loc("Songs")) {
                        ForEach(results) { song in
                            SongRow(song: song) { state.play(song) }
                        }
                        if results.isEmpty {
                            Text(WaveTheme.loc("No songs yet")).foregroundStyle(WaveTheme.muted)
                        }
                    }
                    Section(WaveTheme.loc("YouTube")) {
                        Button(WaveTheme.loc("Search online")) { showOnlineNotice = true }
                            .disabled(searchingOnline || query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
                        if searchingOnline { ProgressView() }
                        if let onlineMessage { Text(onlineMessage).foregroundStyle(WaveTheme.muted) }
                        ForEach(onlineResults) { video in
                            Button {
                                if state.isPlaying { state.togglePlayPause() }
                                selectedVideo = video
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(video.title).foregroundStyle(WaveTheme.text)
                                    Text(video.author).font(.caption).foregroundStyle(WaveTheme.muted)
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(WaveTheme.background.ignoresSafeArea())
            .searchable(text: $query, prompt: WaveTheme.loc("Search your music"))
            .onChange(of: query) { _, _ in onlineResults = []; onlineMessage = nil }
            .navigationTitle(WaveTheme.loc("Search"))
            .alert(WaveTheme.loc("Search online"), isPresented: $showOnlineNotice) {
                Button(WaveTheme.loc("Cancel"), role: .cancel) {}
                Button(WaveTheme.loc("Search online")) { Task { await searchOnline(query) } }
            } message: {
                Text(WaveTheme.loc("Your search is sent to Wave and YouTube. Playing a video connects to YouTube."))
            }
            .sheet(item: $selectedVideo) { video in
                NavigationStack {
                    YouTubePlayer(videoID: video.videoId)
                        .navigationTitle(video.title)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { Button(WaveTheme.loc("Close")) { selectedVideo = nil } }
                }
            }
        }
    }

    @MainActor
    private func searchOnline(_ phrase: String) async {
        searchingOnline = true
        onlineMessage = nil
        defer { searchingOnline = false }
        do {
            var request = URLRequest(url: URL(string: "https://wave.jaime-gaming.com/api/youtube-search")!, timeoutInterval: 12)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["q": String(phrase.prefix(180))])
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
            var data = Data()
            for try await byte in bytes {
                guard data.count < 200_000 else { throw URLError(.dataLengthExceedsMaximum) }
                data.append(byte)
            }
            let decoded = try JSONDecoder().decode(OnlineSearchResponse.self, from: data)
            guard query == phrase else { return }
            onlineResults = Array(decoded.items.prefix(15)).filter { video in
                video.videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil
            }
            if onlineResults.isEmpty { onlineMessage = WaveTheme.loc("No matching songs found. Try another search or paste a YouTube link.") }
        } catch {
            if query == phrase { onlineMessage = WaveTheme.loc("Search is unreachable right now.") }
        }
    }
}

/// Uses YouTube's official embedded player. No audio is downloaded or extracted.
private struct YouTubePlayer: UIViewRepresentable {
    let videoID: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.loadHTMLString("""
        <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>html,body{margin:0;background:#0f121c;height:100%}iframe{width:100%;height:100%;border:0}</style>
        <iframe src="https://www.youtube-nocookie.com/embed/\(videoID)?playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
        """, baseURL: URL(string: "https://wave.jaime-gaming.com/"))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct CatalogueItem: Decodable, Identifiable {
    let trackId: Int
    let trackName: String
    let artistName: String
    let collectionName: String?
    var id: Int { trackId }
}

private struct CatalogueResponse: Decodable {
    let results: [CatalogueItem]
}

/// The listener searches explicitly and chooses a result before local tags change.
struct CatalogueView: View {
    @EnvironmentObject private var state: WaveState
    @Environment(\.dismiss) private var dismiss
    let song: Song
    @State private var query = ""
    @State private var results: [CatalogueItem] = []
    @State private var selected: CatalogueItem?
    @State private var confirmSearch = false
    @State private var searching = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            List {
                TextField(WaveTheme.loc("Search your music"), text: $query)
                Button(WaveTheme.loc("Search online")) { confirmSearch = true }
                    .disabled(searching || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if searching { ProgressView() }
                if let message { Text(message).foregroundStyle(WaveTheme.muted) }
                ForEach(results) { result in
                    Button {
                        selected = result
                    } label: {
                        VStack(alignment: .leading) {
                            Text(result.trackName).foregroundStyle(WaveTheme.text)
                            Text("\(result.artistName) · \(result.collectionName ?? "")")
                                .font(.caption).foregroundStyle(WaveTheme.muted)
                        }
                    }
                }
            }
            .navigationTitle(WaveTheme.loc("Find song metadata"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button(WaveTheme.loc("Close")) { dismiss() } }
            .onAppear { query = "\(song.artist) \(song.title)" }
            .onChange(of: query) { _, _ in results = []; message = nil }
            .alert(WaveTheme.loc("Search online"), isPresented: $confirmSearch) {
                Button(WaveTheme.loc("Cancel"), role: .cancel) {}
                Button(WaveTheme.loc("Search online")) { Task { await searchCatalogue(query) } }
            } message: {
                Text(WaveTheme.loc("Your search is sent to the iTunes catalogue. Your audio is never sent."))
            }
            .alert(WaveTheme.loc("Apply metadata?"), isPresented: Binding(
                get: { selected != nil }, set: { if !$0 { selected = nil } }
            )) {
                Button(WaveTheme.loc("Cancel"), role: .cancel) { selected = nil }
                Button(WaveTheme.loc("Apply")) {
                    if let selected {
                        state.applyCatalogue(songID: song.id, title: selected.trackName, artist: selected.artistName, album: selected.collectionName ?? "")
                    }
                    selected = nil
                    dismiss()
                }
            } message: {
                Text(selected.map { "\($0.trackName) — \($0.artistName)" } ?? "")
            }
        }
    }

    @MainActor
    private func searchCatalogue(_ phrase: String) async {
        searching = true
        message = nil
        defer { searching = false }
        do {
            var components = URLComponents(string: "https://itunes.apple.com/search")!
            components.queryItems = [URLQueryItem(name: "term", value: String(phrase.prefix(180))), URLQueryItem(name: "entity", value: "song"), URLQueryItem(name: "limit", value: "20")]
            guard let url = components.url else { throw URLError(.badURL) }
            let (bytes, response) = try await URLSession.shared.bytes(for: URLRequest(url: url, timeoutInterval: 12))
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
            var data = Data()
            for try await byte in bytes {
                guard data.count < 300_000 else { throw URLError(.dataLengthExceedsMaximum) }
                data.append(byte)
            }
            let answer = try JSONDecoder().decode(CatalogueResponse.self, from: data)
            guard query == phrase else { return }
            results = Array(answer.results.prefix(20))
            if results.isEmpty { message = WaveTheme.loc("No results") }
        } catch {
            if query == phrase { message = WaveTheme.loc("Search is unreachable right now.") }
        }
    }
}
