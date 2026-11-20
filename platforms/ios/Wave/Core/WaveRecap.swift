import Foundation

/// The three periods the web, Android, Windows and iOS clients all understand.
public enum RemixPeriod: String, CaseIterable, Sendable {
    case weekly
    case monthly
    case yearly
}

public struct RemixSongRank: Sendable, Equatable {
    public let song: Song
    public let seconds: TimeInterval
    public let plays: Int

    public init(song: Song, seconds: TimeInterval, plays: Int) {
        self.song = song
        self.seconds = seconds
        self.plays = plays
    }
}

public struct RemixArtistRank: Sendable, Equatable {
    public let name: String
    public let seconds: TimeInterval
    public let plays: Int

    public init(name: String, seconds: TimeInterval, plays: Int) {
        self.name = name
        self.seconds = seconds
        self.plays = plays
    }
}

public struct RemixRecap: Sendable {
    public let period: RemixPeriod
    public let start: Date
    public let end: Date
    public let seconds: TimeInterval
    public let plays: Int
    public let tracks: Int
    public let artists: Int
    public let days: [TimeInterval]
    public let topSongs: [RemixSongRank]
    public let topArtists: [RemixArtistRank]
    public let songs: [Song]

    public init(
        period: RemixPeriod,
        start: Date,
        end: Date,
        seconds: TimeInterval,
        plays: Int,
        tracks: Int,
        artists: Int,
        days: [TimeInterval],
        topSongs: [RemixSongRank],
        topArtists: [RemixArtistRank],
        songs: [Song]
    ) {
        self.period = period
        self.start = start
        self.end = end
        self.seconds = seconds
        self.plays = plays
        self.tracks = tracks
        self.artists = artists
        self.days = days
        self.topSongs = topSongs
        self.topArtists = topArtists
        self.songs = songs
    }
}

/// A recap built only from the listener's own atomic history file.
///
/// No service, account or network timestamp takes part. A play contributes the
/// song's local duration (or half of it when the listener skipped early); the
/// same rule is used for the day bars and the ranked songs.
public enum WaveRecap {
    public static func summarize(
        songs: [Song],
        history: [HistoryEntry],
        period: RemixPeriod,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> RemixRecap {
        let (start, end, bucketCount, component): (Date, Date, Int, Calendar.Component) = {
            switch period {
            case .weekly:
                let start = calendar.dateInterval(of: .weekOfYear, for: now)?.start ?? now
                let end = calendar.date(byAdding: .weekOfYear, value: 1, to: start) ?? now
                return (start, end, 7, .day)
            case .monthly:
                let start = calendar.dateInterval(of: .month, for: now)?.start ?? now
                let end = calendar.date(byAdding: .month, value: 1, to: start) ?? now
                let count = calendar.range(of: .day, in: .month, for: start)?.count ?? 30
                return (start, end, count, .day)
            case .yearly:
                let start = calendar.dateInterval(of: .year, for: now)?.start ?? now
                let end = calendar.date(byAdding: .year, value: 1, to: start) ?? now
                return (start, end, 12, .month)
            }
        }()

        let byID = Dictionary(songs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var days = Array(repeating: 0.0, count: bucketCount)
        var secondsBySong: [String: TimeInterval] = [:]
        var playsBySong: [String: Int] = [:]
        var secondsByArtist: [String: TimeInterval] = [:]
        var playsByArtist: [String: Int] = [:]
        var totalSeconds = 0.0
        var totalPlays = 0

        for entry in history where entry.playedAt >= start && entry.playedAt < end {
            guard let song = byID[entry.songID] else { continue }
            let seconds = max(0, song.duration) * (entry.completed ? 1 : 0.5)
            let offset: Int
            switch component {
            case .month:
                offset = calendar.dateComponents([.month], from: start, to: entry.playedAt).month ?? 0
            default:
                offset = calendar.dateComponents([.day], from: start, to: entry.playedAt).day ?? 0
            }
            if offset >= 0 && offset < bucketCount { days[offset] += seconds }
            totalSeconds += seconds
            totalPlays += 1
            secondsBySong[song.id, default: 0] += seconds
            playsBySong[song.id, default: 0] += 1
            let artist = song.artist.isEmpty ? "Unknown artist" : song.artist
            secondsByArtist[artist, default: 0] += seconds
            playsByArtist[artist, default: 0] += 1
        }

        var rankedSongs: [RemixSongRank] = []
        for (id, seconds) in secondsBySong {
            guard let song = byID[id] else { continue }
            rankedSongs.append(RemixSongRank(song: song, seconds: seconds, plays: playsBySong[id] ?? 0))
        }
        rankedSongs.sort { lhs, rhs in
            if lhs.seconds == rhs.seconds { return lhs.plays > rhs.plays }
            return lhs.seconds > rhs.seconds
        }
        var rankedArtists: [RemixArtistRank] = []
        for (name, seconds) in secondsByArtist {
            rankedArtists.append(RemixArtistRank(name: name, seconds: seconds, plays: playsByArtist[name] ?? 0))
        }
        rankedArtists.sort { lhs, rhs in
            if lhs.seconds == rhs.seconds { return lhs.name < rhs.name }
            return lhs.seconds > rhs.seconds
        }

        return RemixRecap(
            period: period,
            start: start,
            end: end,
            seconds: totalSeconds,
            plays: totalPlays,
            tracks: secondsBySong.count,
            artists: secondsByArtist.count,
            days: days,
            topSongs: rankedSongs,
            topArtists: rankedArtists,
            songs: rankedSongs.map(\.song)
        )
    }
}
