import SwiftUI
import UniformTypeIdentifiers
import WaveCore

/// Reserve space inside each tab instead of covering its last rows and controls.
private struct PlayerBarInset: ViewModifier {
    @EnvironmentObject private var state: WaveState

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            if state.current != nil {
                PlayerBar()
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(WaveTheme.background)
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var state: WaveState
    @State private var importing = false

    var body: some View {
        TabView(selection: $state.selectedTab) {
            HomeView(importing: $importing)
                .modifier(PlayerBarInset())
                .tabItem { Label(WaveTheme.loc("Home"), systemImage: "house.fill") }
                .tag(0)
            LibraryView(importing: $importing)
                .modifier(PlayerBarInset())
                .tabItem { Label(WaveTheme.loc("Library"), systemImage: "music.note.list") }
                .tag(1)
            SearchView()
                .modifier(PlayerBarInset())
                .tabItem { Label(WaveTheme.loc("Search"), systemImage: "magnifyingglass") }
                .tag(2)
            RemixView()
                .modifier(PlayerBarInset())
                .tabItem { Label(WaveTheme.loc("Remix"), systemImage: "chart.bar.fill") }
                .tag(3)
            SettingsView(importing: $importing)
                .modifier(PlayerBarInset())
                .tabItem { Label(WaveTheme.loc("Settings"), systemImage: "gearshape") }
                .tag(4)
        }
        .tint(WaveTheme.accent)
        .background(WaveTheme.background.ignoresSafeArea())
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
