import SwiftUI
import WaveCore

/// Wave's iOS palette and one small localization helper.
///
/// The English sentence is the localization key, exactly as on the web, Android
/// and Windows clients. `es.lproj/Localizable.strings` is generated from the
/// same `i18n/es.json` by `scripts/build-i18n.mjs`, so a phrase never drifts
/// between platforms. A missing key simply reads as English.
enum WaveTheme {
    static let background = Color(red: 0.071, green: 0.075, blue: 0.102)
    static let surface = Color(red: 0.11, green: 0.12, blue: 0.16)
    static let surfaceRaised = Color(red: 0.15, green: 0.16, blue: 0.21)
    static let accent = Color(red: 0.55, green: 0.71, blue: 1.0)
    static let text = Color.white
    static let muted = Color.white.opacity(0.62)

    static func loc(_ english: String) -> String {
        NSLocalizedString(english, comment: "")
    }

    /// The version the listener sees comes from the built Info.plist.
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
    }
}
