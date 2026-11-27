import AppIntents
import SwiftUI
import WidgetKit




func waveLoc(_ key: String) -> String {
    NSLocalizedString(key, comment: "")
}

private extension Color {
    static let waveWidgetBackground = Color(red: 0.11, green: 0.12, blue: 0.16)
    static let waveWidgetAccent = Color(red: 0.55, green: 0.71, blue: 1.0)
}

struct WaveWidgetEntry: TimelineEntry {
    let date: Date
}

struct WaveTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> WaveWidgetEntry {
        WaveWidgetEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (WaveWidgetEntry) -> Void) {
        completion(WaveWidgetEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WaveWidgetEntry>) -> Void) {
        completion(Timeline(entries: [WaveWidgetEntry(date: Date())], policy: .never))
    }
}

struct WaveWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(waveLoc("Open Wave"), systemImage: "waveform")
                .font(.system(size: family == .systemSmall ? 15 : 18, weight: .bold))
                .foregroundStyle(Color.waveWidgetAccent)
            Text(waveLoc("Continue listening"))
                .font(.system(size: family == .systemSmall ? 12 : 14))
                .foregroundStyle(.white.opacity(0.72))
                .lineLimit(2)
            Spacer(minLength: 4)
            HStack(spacing: 8) {
                Link(destination: URL(string: "wave://remix")!) {
                    Label(waveLoc("Show Remix"), systemImage: "chart.bar")
                        .font(.caption)
                        .lineLimit(1)
                }
                Button(intent: ResumePlaybackIntent()) {
                    Label(waveLoc("Resume playback"), systemImage: "play.fill")
                        .font(.caption)
                        .lineLimit(1)
                }
                .buttonStyle(.borderless)
            }
            .foregroundStyle(.white)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(Color.waveWidgetBackground, for: .widget)
        .widgetURL(URL(string: "wave://home")!)
    }
}

struct WaveLockScreenWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(waveLoc("Open Wave"), systemImage: "waveform")
                .font(.caption.weight(.semibold))
            Text(waveLoc("Wave on CarPlay"))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(Color.waveWidgetBackground, for: .widget)
        .widgetURL(URL(string: "wave://remix")!)
    }
}

struct WaveHomeWidget: Widget {
    let kind = "WaveHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WaveTimelineProvider()) { _ in
            WaveWidgetView()
        }
        .configurationDisplayName(waveLoc("Wave widget"))
        .description(waveLoc("Continue listening"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WaveLockScreenWidget: Widget {
    let kind = "WaveLockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WaveTimelineProvider()) { _ in
            WaveLockScreenWidgetView()
        }
        .configurationDisplayName(waveLoc("Wave widgets"))
        .description(waveLoc("Recently played"))
        .supportedFamilies([.accessoryRectangular, .accessoryCircular])
    }
}
