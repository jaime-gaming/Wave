import SwiftUI
import WaveCore

@main
struct WaveApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var state = WaveState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .preferredColorScheme(.dark)
                .onAppear { state.start() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { state.persist() }
                }
        }
    }
}
