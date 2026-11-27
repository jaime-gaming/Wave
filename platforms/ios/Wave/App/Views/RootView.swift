import SwiftUI
import UniformTypeIdentifiers
import WaveCore


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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func tabButton(_ title: String, icon: String, tag: Int) -> some View {
        let selected = state.selectedTab == tag
        return Button {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { state.selectedTab = tag }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 19, weight: .semibold))
                Text(WaveTheme.loc(title)).font(.system(size: 10, weight: selected ? .bold : .medium))
                    .lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(selected ? WaveTheme.accent : WaveTheme.muted)
            .background(selected ? WaveTheme.accent.opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WaveTheme.loc(title))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    var body: some View {
        GeometryReader { geometry in
            TabView(selection: $state.selectedTab) {
                HomeView(importing: $importing)
                    .modifier(PlayerBarInset())
                    .tabItem { Label(WaveTheme.loc("Home"), systemImage: "house.fill") }
                    .tag(0)
                LibraryView(importing: $importing)
                    .id(state.libraryNavigationID)
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
            .toolbar(.hidden, for: .tabBar)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                HStack(spacing: 4) {
                    tabButton("Home", icon: "house.fill", tag: 0)
                    tabButton("Search", icon: "magnifyingglass", tag: 2)
                    tabButton("Library", icon: "music.note.list", tag: 1)
                    tabButton("Remix", icon: "chart.bar.fill", tag: 3)
                    tabButton("Settings", icon: "gearshape", tag: 4)
                }
                .padding(6)
                .background(WaveTheme.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(.horizontal, 12)
                .padding(.bottom, 6)
                .background(WaveTheme.background)
            }
            .environment(\.waveWindowSize, geometry.size)
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
            .alert(WaveTheme.loc("Playback"), isPresented: Binding(
                get: { state.playbackError != nil && !state.playerExpanded },
                set: { if !$0 { state.playbackError = nil } }
            )) {
                Button(WaveTheme.loc("Close")) { state.playbackError = nil }
            } message: { Text(state.playbackError ?? "") }
            .fileImporter(
                isPresented: $importing,
                allowedContentTypes: [.audio],
                allowsMultipleSelection: true
            ) { result in
                if let urls = try? result.get() { state.importFiles(urls) }
            }
        }
    }
}
