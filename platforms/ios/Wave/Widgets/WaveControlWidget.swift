import AppIntents
import SwiftUI
import WidgetKit





@available(iOS 18.0, *)
struct WaveControlWidget: ControlWidget {
    static let kind = "io.github.jaimegaming.wave.control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: TogglePlaybackIntent()) {
                Label(waveLoc("Control Wave"), systemImage: "playpause.fill")
            }
        }
        .displayName("Control Wave")
        .description("Play or pause")
    }
}
