import SwiftUI
import WaveCore

@main
struct WaveApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var state = WaveState()
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("wave.appearance") private var appearance = "system"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
                .onAppear { state.start() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { state.persist() }
                }
        }
    }
}
