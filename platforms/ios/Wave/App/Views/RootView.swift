import SwiftUI
import UniformTypeIdentifiers
import WaveCore

struct RootView: View {
    @EnvironmentObject private var state: WaveState
    @State private var importing = false

    var body: some View {
        TabView(selection: $state.selectedTab) {
            HomeView(importing: $importing)
                .tabItem { Label(WaveTheme.loc("Home"), systemImage: "house.fill") }
                .tag(0)
            LibraryView(importing: $importing)
                .tabItem { Label(WaveTheme.loc("Library"), systemImage: "music.note.list") }
                .tag(1)
            SearchView()
                .tabItem { Label(WaveTheme.loc("Search"), systemImage: "magnifyingglass") }
                .tag(2)
            RemixView()
                .tabItem { Label(WaveTheme.loc("Remix"), systemImage: "chart.bar.fill") }
                .tag(3)
            SettingsView(importing: $importing)
                .tabItem { Label(WaveTheme.loc("Settings"), systemImage: "gearshape") }
                .tag(4)
        }
        .tint(WaveTheme.accent)
        .background(WaveTheme.background.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if state.current != nil {
                PlayerBar()
                    .padding(.horizontal, 10)
                    .padding(.bottom, 52)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .fullScreenCover(
            isPresented: Binding(
                get: { state.playerExpanded },
                set: { state.playerExpanded = $0 }
            )
        ) {
            NowPlayingView()
                .environmentObject(state)
        }
        .fileImporter(
            isPresented: $importing,
            allowedContentTypes: [.audio],
            allowsMultipleSelection: true
        ) { result in
            if let urls = try? result.get() { state.importFiles(urls) }
        }
    }
}
