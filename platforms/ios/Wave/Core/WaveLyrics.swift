import Foundation

/// One timed line of a local LRC file.
public struct LyricLine: Codable, Hashable, Sendable {
    public let time: TimeInterval
    public let text: String

    public init(time: TimeInterval, text: String) {
        self.time = time
        self.text = text
    }
}

/// Lyrics are parsed on-device from the file the listener chose. No request is
/// made for them, and nothing is sent anywhere.
public enum WaveLyrics {
    private static let stampPattern = #"\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]"#
    private static let wordPattern = #"<\d{1,3}:[0-5]?\d(?:[.:]\d{1,3})?>"#

    private static let stampRegex = try? NSRegularExpression(pattern: stampPattern)
    private static let wordRegex = try? NSRegularExpression(pattern: wordPattern)

    public static func parse(_ raw: String, offset: TimeInterval = 0) -> [LyricLine] {
        guard let stampRegex else { return [] }
        var result: [LyricLine] = []
        for row in raw.split(whereSeparator: \.isNewline) {
            let line = String(row)
            let range = NSRange(line.startIndex..., in: line)
            let stamps = stampRegex.matches(in: line, range: range)
            if stamps.isEmpty { continue }
            var text = stampRegex.stringByReplacingMatches(in: line, range: range, withTemplate: "")
            if let wordRegex {
                text = wordRegex.stringByReplacingMatches(
                    in: text,
                    range: NSRange(text.startIndex..., in: text),
                    withTemplate: ""
                )
            }
            let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
            for match in stamps {
                guard
                    let minutes = group(match, 1, in: line),
                    let seconds = group(match, 2, in: line)
                else { continue }
                let fraction = group(match, 3, in: line) ?? "0"
                let hundredths = Double(fraction) ?? 0
                let scale = pow(10, Double(fraction.count))
                let time = (Double(minutes) ?? 0) * 60 + (Double(seconds) ?? 0) + hundredths / scale
                result.append(LyricLine(time: max(0, time + offset), text: clean))
            }
        }
        return result.sorted { $0.time < $1.time }
    }

    private static func group(_ match: NSTextCheckingResult, _ index: Int, in line: String) -> String? {
        let range = match.range(at: index)
        guard range.location != NSNotFound, let swiftRange = Range(range, in: line) else { return nil }
        return String(line[swiftRange])
    }

    /// Plain, untimed lyrics are still shown; they just do not follow the clock.
    public static func plain(_ raw: String) -> [String] {
        raw.split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    public static func activeLine(_ lines: [LyricLine], at time: TimeInterval) -> Int? {
        var found: Int?
        for (index, line) in lines.enumerated() where line.time >= 0 && line.time <= time { found = index }
        return found
    }

    /// What the Now Playing page draws: timed LRC when there are stamps, or a
    /// plain text file as unhighlighted lines. A negative time means "no clock".
    public static func displayLines(_ raw: String) -> [LyricLine] {
        let synced = parse(raw)
        if !synced.isEmpty { return synced }
        return plain(raw).map { LyricLine(time: -1, text: $0) }
    }

    /// The sung extent of a song: what is before the first line and after the
    /// last one is instrumental. This is the iPhone's local equivalent of the
    /// web client's vocal-region analysis, and it costs no audio decoding.
    public static func sungBounds(_ lines: [LyricLine]) -> (first: TimeInterval, last: TimeInterval)? {
        guard let first = lines.first?.time, let last = lines.map(\.time).max() else { return nil }
        return (first, last)
    }
}
