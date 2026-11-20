import Foundation
import MediaPlayer
import UIKit
import WaveCore

/// The lock screen, Control Center, headphones and CarPlay.
///
/// Only the song the listener already owns is described here: title, artist,
/// album, artwork and the clock. No artwork or metadata leaves the device.
final class NowPlayingCenter {
    private let infoCenter = MPNowPlayingInfoCenter.default()
    private let commands = MPRemoteCommandCenter.shared()

    func update(song: Song?, time: TimeInterval, playing: Bool, artwork: UIImage?) {
        guard let song else {
            infoCenter.nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: song.title,
            MPMediaItemPropertyArtist: song.artist,
            MPMediaItemPropertyAlbumTitle: song.album,
            MPMediaItemPropertyPlaybackDuration: max(0, song.duration),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, time),
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
        if let artwork {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: artwork.size) { _ in artwork }
        }
        infoCenter.nowPlayingInfo = info
    }

    func register(
        play: @escaping () -> Void,
        pause: @escaping () -> Void,
        next: @escaping () -> Void,
        previous: @escaping () -> Void,
        seek: @escaping (TimeInterval) -> Void
    ) {
        commands.playCommand.isEnabled = true
        commands.pauseCommand.isEnabled = true
        commands.nextTrackCommand.isEnabled = true
        commands.previousTrackCommand.isEnabled = true
        commands.changePlaybackPositionCommand.isEnabled = true

        _ = commands.playCommand.addTarget { _ in
            play()
            return .success
        }
        _ = commands.pauseCommand.addTarget { _ in
            pause()
            return .success
        }
        _ = commands.nextTrackCommand.addTarget { _ in
            next()
            return .success
        }
        _ = commands.previousTrackCommand.addTarget { _ in
            previous()
            return .success
        }
        _ = commands.changePlaybackPositionCommand.addTarget { event in
            guard let change = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            seek(change.positionTime)
            return .success
        }
    }
}
