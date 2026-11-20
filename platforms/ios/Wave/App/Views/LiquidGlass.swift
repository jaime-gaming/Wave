import SwiftUI
import UIKit
import WaveCore

/// iOS-only Liquid Glass.
///
/// iOS 26 gets the real SwiftUI `GlassEffectContainer` and `glassEffect` API.
/// iOS 17–25 keep a quiet material fallback. Reduce Transparency replaces both
/// with an opaque Wave surface, and related controls share one container so no
/// glass samples another glass. This file is never used by the web, Android or
/// Windows clients.
@ViewBuilder
func waveGlassContainer<Content: View>(
    spacing: CGFloat = 16,
    @ViewBuilder content: () -> Content
) -> some View {
    if #available(iOS 26, *) {
        GlassEffectContainer(spacing: spacing) {
            content()
        }
    } else {
        content()
    }
}

struct WaveGlassSurface: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if UIAccessibility.isReduceTransparencyEnabled {
            content.background(WaveTheme.surfaceRaised, in: shape)
        } else if #available(iOS 26, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content.background(.ultraThinMaterial, in: shape)
        }
    }
}

struct WaveGlassButtonStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.buttonStyle(.glass)
        } else {
            content.buttonStyle(.borderless)
        }
    }
}

extension View {
    /// One child of a `waveGlassContainer`. Do not nest another glass surface.
    func waveGlass(cornerRadius: CGFloat = 20) -> some View {
        modifier(WaveGlassSurface(cornerRadius: cornerRadius))
    }

    /// iOS 26's native glass button, or an ordinary borderless button earlier.
    func waveGlassButton() -> some View {
        modifier(WaveGlassButtonStyle())
    }
}
