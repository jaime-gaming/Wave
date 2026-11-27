import SwiftUI
import UIKit
import WaveCore








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

    func waveGlass(cornerRadius: CGFloat = 20) -> some View {
        modifier(WaveGlassSurface(cornerRadius: cornerRadius))
    }


    func waveGlassButton() -> some View {
        modifier(WaveGlassButtonStyle())
    }
}
