import SwiftUI
import UIKit
import WaveCore







enum WaveTheme {
    private static func adaptive(_ light: UIColor, _ dark: UIColor) -> Color {
        Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light })
    }

    static let background = adaptive(UIColor(red: 0.96, green: 0.97, blue: 0.99, alpha: 1), UIColor(red: 0.071, green: 0.075, blue: 0.102, alpha: 1))
    static let surface = adaptive(UIColor(red: 0.99, green: 0.99, blue: 1, alpha: 1), UIColor(red: 0.11, green: 0.12, blue: 0.16, alpha: 1))
    static let surfaceRaised = adaptive(UIColor(red: 0.90, green: 0.92, blue: 0.96, alpha: 1), UIColor(red: 0.15, green: 0.16, blue: 0.21, alpha: 1))
    static let accent = adaptive(UIColor(red: 0.18, green: 0.33, blue: 0.59, alpha: 1), UIColor(red: 0.55, green: 0.71, blue: 1, alpha: 1))
    static let text = adaptive(UIColor(red: 0.10, green: 0.12, blue: 0.17, alpha: 1), .white)
    static let muted = adaptive(UIColor(red: 0.32, green: 0.36, blue: 0.44, alpha: 1), UIColor.white.withAlphaComponent(0.70))

    static func loc(_ english: String) -> String {
        NSLocalizedString(english, comment: "")
    }


    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
    }
}
