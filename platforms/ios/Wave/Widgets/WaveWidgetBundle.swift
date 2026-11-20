import SwiftUI
import WidgetKit

/// The source-only widget extension entry point.
///
/// Home Screen and Lock Screen widgets are available on iOS 17. Control Center
/// and the Live Activity/Dynamic Island are added by a single iOS 18
/// availability branch, so the widget bundle keeps a real iOS 17 fallback.
@main
struct WaveWidgets: WidgetBundle {
    var body: some Widget {
        WaveHomeWidget()
        WaveLockScreenWidget()
        if #available(iOS 18.0, *) {
            WaveControlWidget()
            WaveLiveActivityWidget()
        }
    }
}
