import AppIntents
import SwiftUI
import WidgetKit

/// Control Center, the Lock Screen and the Action button on iOS 18+.
/// The control runs a local App Intent; it does not read the library or talk to
/// a service. Earlier systems keep the ordinary timeline widgets and remote
/// playback commands.
@available(iOS 18.0, *)
struct WaveControlWidget: ControlWidget {
    static let kind = "io.github.jaimegaming.wave.control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: TogglePlaybackIntent()) {
                Label(waveLoc("Control Wave"), systemImage: "playpause.fill")
            }
        }
        .displayName(waveLoc("Control Wave"))
        .description(waveLoc("Play or pause"))
    }
}
