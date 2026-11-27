import SwiftUI
import WidgetKit






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
