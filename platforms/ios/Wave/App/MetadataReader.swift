import Foundation
import AVFoundation
import CoreMedia
import WaveCore

/// Reads the tags already inside the listener's file, locally.
///
/// Nothing is looked up online and the audio bytes are never rewritten. The
/// synchronous metadata accessors are kept on purpose: they work for every
/// format AVFoundation can open and need no authorization or network.
enum MetadataReader {
    struct Result {
        var title: String?
        var artist: String?
        var album: String?
        var duration: TimeInterval = 0
        var bpm: Double?
        var artwork: Data?
    }

    static func read(_ url: URL) -> Result {
        var result = Result()
        let asset = AVURLAsset(url: url)
        let seconds = CMTimeGetSeconds(asset.duration)
        if seconds.isFinite, seconds > 0 { result.duration = seconds }

        for item in asset.commonMetadata {
            guard let key = item.commonKey?.rawValue else { continue }
            switch key {
            case "title": result.title = item.stringValue
            case "creator", "artist": result.artist = item.stringValue
            case "albumName": result.album = item.stringValue
            case "artwork": result.artwork = item.dataValue
            default: break
            }
        }

        // A tempo tag is optional. When present it lets Mix place both
        // instrumental edges on the bar instead of falling back to a fade.
        for item in asset.metadata {
            let identifier = item.identifier?.rawValue ?? ""
            if (identifier.contains("tmpo") || item.commonKey?.rawValue == "bpm"),
               let value = item.numberValue?.doubleValue,
               value >= 60, value <= 200 {
                result.bpm = value
                break
            }
        }
        return result
    }

    /// A file with no title tag still gets a readable name.
    static func fallbackTitle(_ fileName: String) -> String {
        let name = (fileName as NSString).deletingPathExtension
        return name
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
