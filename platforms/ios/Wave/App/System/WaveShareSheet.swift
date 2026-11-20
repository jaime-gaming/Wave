import SwiftUI
import UIKit
import WaveCore

/// The system share sheet for a song the listener already owns. The audio URL
/// points at the app's own Documents folder; Wave posts nothing to a service.
struct WaveShareSheet: UIViewControllerRepresentable {
    let song: Song
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.title = song.title.isEmpty ? nil : song.title
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
