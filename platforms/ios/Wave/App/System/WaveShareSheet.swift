import SwiftUI
import UIKit
import WaveCore



struct WaveShareSheet: UIViewControllerRepresentable {
    let song: Song
    let artwork: UIImage?

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let image = listeningCard(song: song, artwork: artwork)
        return UIActivityViewController(
            activityItems: [image, URL(string: "https://wave.jaime-gaming.com")!],
            applicationActivities: nil
        )
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private func listeningCard(song: Song, artwork: UIImage?) -> UIImage {
    let size = CGSize(width: 1080, height: 1350)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
        let bounds = CGRect(origin: .zero, size: size)
        UIColor(red: 0.06, green: 0.07, blue: 0.11, alpha: 1).setFill()
        context.fill(bounds)
        let artRect = CGRect(x: 115, y: 190, width: 850, height: 850)
        context.cgContext.saveGState()
        UIBezierPath(roundedRect: artRect, cornerRadius: 46).addClip()
        if let artwork {
            let factor = max(artRect.width / artwork.size.width, artRect.height / artwork.size.height)
            let scaled = CGSize(width: artwork.size.width * factor, height: artwork.size.height * factor)
            artwork.draw(in: CGRect(x: artRect.midX - scaled.width / 2, y: artRect.midY - scaled.height / 2, width: scaled.width, height: scaled.height))
        } else {
            UIColor(red: 0.15, green: 0.19, blue: 0.29, alpha: 1).setFill()
            context.fill(artRect)
            let note = UIImage(systemName: "music.note")?.withTintColor(.white, renderingMode: .alwaysOriginal)
            note?.draw(in: CGRect(x: 410, y: 470, width: 260, height: 260))
        }
        context.cgContext.restoreGState()
        func text(_ value: String, rect: CGRect, size: CGFloat, color: UIColor, weight: UIFont.Weight) {
            let style = NSMutableParagraphStyle()
            style.lineBreakMode = .byTruncatingTail
            (value as NSString).draw(in: rect, withAttributes: [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: style])
        }
        text("WAVE", rect: CGRect(x: 115, y: 70, width: 850, height: 70), size: 50, color: .white, weight: .bold)
        text(song.title, rect: CGRect(x: 115, y: 1090, width: 850, height: 84), size: 62, color: .white, weight: .bold)
        text(song.artist, rect: CGRect(x: 115, y: 1170, width: 850, height: 60), size: 42, color: UIColor(white: 0.76, alpha: 1), weight: .medium)
        text("wave.jaime-gaming.com", rect: CGRect(x: 115, y: 1280, width: 850, height: 48), size: 30, color: UIColor(red: 0.65, green: 0.78, blue: 1, alpha: 1), weight: .semibold)
    }
}
