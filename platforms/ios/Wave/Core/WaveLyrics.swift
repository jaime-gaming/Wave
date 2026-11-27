import Foundation


public struct LyricWord: Codable, Hashable, Sendable {
    public let time: TimeInterval
    public let end: TimeInterval?
    public let text: String

    public init(time: TimeInterval, end: TimeInterval? = nil, text: String) {
        self.time = time
        self.end = end
        self.text = text
    }
}

public struct LyricLine: Codable, Hashable, Sendable {
    public let time: TimeInterval
    public let text: String
    public let words: [LyricWord]

    public init(time: TimeInterval, text: String, words: [LyricWord] = []) {
        self.time = time
        self.text = text
        self.words = words
    }
}


public enum WaveLyrics {
    private static let stamps = try! NSRegularExpression(pattern: #"\[(\d{1,4}):([0-5]?\d)(?:[.,:](\d{1,3}))?\]"#)
    private static let markers = try! NSRegularExpression(pattern: #"<(\d{1,4}):([0-5]?\d)(?:[.,:](\d{1,3}))?>"#)
    private static let header = try! NSRegularExpression(pattern: #"(?im)^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$"#)
    private static let metadata = try! NSRegularExpression(pattern: #"(?i)^\[(ar|ti|al|by|offset|length|re|ve):"#)

    public static func parse(_ raw: String, offset: TimeInterval = 0) -> [LyricLine] {
        guard raw.count <= 100_000, offset.isFinite else { return [] }
        let source = raw.hasPrefix("\u{FEFF}") ? String(raw.dropFirst()) : raw
        let rawRange = NSRange(source.startIndex..., in: source)
        let headerMatch = header.firstMatch(in: source, range: rawRange)
        let headerOffset = headerMatch.flatMap { group($0, 1, in: source) }.flatMap(Double.init) ?? 0
        guard abs(headerOffset) <= 10_000 else { return [] }
        let adjustment = offset - headerOffset / 1000
        var result: [LyricLine] = []
        for row in source.split(whereSeparator: \.isNewline) {
            let line = String(row)
            let range = NSRange(line.startIndex..., in: line)
            let lineStamps = stamps.matches(in: line, range: range)
            guard let first = lineStamps.first, let firstTime = clock(first, in: line) else { continue }
            let content = stamps.stringByReplacingMatches(in: line, range: range, withTemplate: "")
            let contentRange = NSRange(content.startIndex..., in: content)
            let wordMarkers = markers.matches(in: content, range: contentRange)
            let clean = markers.stringByReplacingMatches(in: content, range: contentRange, withTemplate: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let text = content as NSString
            var pieces: [LyricWord] = []
            if let firstMarker = wordMarkers.first {
                let prefix = String(text.substring(with: NSRange(location: 0, length: firstMarker.range.location)).drop(while: { $0.isWhitespace }))
                if !prefix.isEmpty { pieces.append(LyricWord(time: firstTime, end: clock(firstMarker, in: content), text: prefix)) }
                for (index, marker) in wordMarkers.enumerated() {
                    guard let time = clock(marker, in: content) else { continue }
                    let start = NSMaxRange(marker.range)
                    let end = index + 1 < wordMarkers.count ? wordMarkers[index + 1].range.location : text.length
                    let part = text.substring(with: NSRange(location: start, length: end - start))
                    if !part.isEmpty {
                        let endTime = index + 1 < wordMarkers.count ? clock(wordMarkers[index + 1], in: content) : nil
                        pieces.append(LyricWord(time: time, end: endTime, text: part))
                    }
                }
            }
            let valid = !pieces.isEmpty && pieces.enumerated().allSatisfy { index, word in
                word.time >= firstTime && (index == 0 || word.time >= pieces[index - 1].time) && (word.end == nil || word.end! >= word.time)
            }
            for stamp in lineStamps {
                guard let time = clock(stamp, in: line) else { continue }
                let shift = time - firstTime + adjustment
                let words = valid ? pieces.map { LyricWord(time: max(0, $0.time + shift), end: $0.end.map { max(0, $0 + shift) }, text: $0.text) } : []
                result.append(LyricLine(time: max(0, time + adjustment), text: clean, words: words))
                if result.count > 2_000 { return [] }
            }
        }
        return result.sorted { $0.time < $1.time }
    }

    private static func group(_ match: NSTextCheckingResult, _ index: Int, in line: String) -> String? {
        let range = match.range(at: index)
        guard range.location != NSNotFound, let swiftRange = Range(range, in: line) else { return nil }
        return String(line[swiftRange])
    }

    private static func clock(_ match: NSTextCheckingResult, in line: String) -> TimeInterval? {
        guard let minutes = group(match, 1, in: line).flatMap(Double.init),
              let seconds = group(match, 2, in: line).flatMap(Double.init) else { return nil }
        let fraction = group(match, 3, in: line) ?? "0"
        return minutes * 60 + seconds + (Double(fraction) ?? 0) / pow(10, Double(fraction.count))
    }

    public static func plain(_ raw: String) -> [String] {
        guard raw.count <= 100_000 else { return [] }
        let source = raw.hasPrefix("\u{FEFF}") ? String(raw.dropFirst()) : raw
        return source.split(whereSeparator: \.isNewline).map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && metadata.firstMatch(in: $0, range: NSRange($0.startIndex..., in: $0)) == nil }
            .prefix(2_000).map { $0 }
    }

    public static func activeLine(_ lines: [LyricLine], at time: TimeInterval) -> Int? {
        guard time.isFinite else { return nil }
        var found: Int?
        for (index, line) in lines.enumerated() where line.time >= 0 && line.time <= time { found = index }
        return found
    }

    public static func displayLines(_ raw: String) -> [LyricLine] {
        let synced = parse(raw)
        if !synced.isEmpty { return synced }
        return plain(raw).map { LyricLine(time: -1, text: $0) }
    }

    public static func sungBounds(_ lines: [LyricLine]) -> (first: TimeInterval, last: TimeInterval)? {
        guard let first = lines.first?.time, let last = lines.map(\.time).max() else { return nil }
        return (first, last)
    }
}
