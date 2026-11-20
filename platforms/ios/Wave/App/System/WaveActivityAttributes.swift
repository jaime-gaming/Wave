import ActivityKit
import Foundation
import WaveCore

/// The small, local payload behind the lock-screen Live Activity and the
/// Dynamic Island. Song files, artwork and the library stay in the app; only
/// these display strings and the playback clock cross into the system surface.
public struct WaveActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var time: TimeInterval
        public var duration: TimeInterval
        public var playing: Bool
        public var mixEnabled: Bool

        public init(time: TimeInterval, duration: TimeInterval, playing: Bool, mixEnabled: Bool) {
            self.time = time
            self.duration = duration
            self.playing = playing
            self.mixEnabled = mixEnabled
        }
    }

    public let songID: String
    public let title: String
    public let artist: String
    public let album: String

    public init(songID: String, title: String, artist: String, album: String) {
        self.songID = songID
        self.title = title
        self.artist = artist
        self.album = album
    }
}
