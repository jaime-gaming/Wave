import ActivityKit
import SwiftUI
import WidgetKit

private let waveActivityBackground = Color(red: 0.11, green: 0.12, blue: 0.16)
private let waveActivityAccent = Color(red: 0.55, green: 0.71, blue: 1.0)

@available(iOS 18.0, *)
struct WaveLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WaveActivityAttributes.self) { context in
            WaveLiveActivityContent(context: context)
                .containerBackground(waveActivityBackground, for: .widget)
                .widgetURL(URL(string: "wave://home")!)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.title, systemImage: "waveform")
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(systemName: context.state.playing ? "pause.fill" : "play.fill")
                        .foregroundStyle(waveActivityAccent)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(context.attributes.artist)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        ProgressView(value: context.state.time, total: max(1, context.state.duration))
                            .tint(waveActivityAccent)
                        if context.state.mixEnabled {
                            Label(waveLoc("Mix"), systemImage: "waveform.path.ecg")
                                .font(.caption2)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "waveform")
                    .foregroundStyle(waveActivityAccent)
            } compactTrailing: {
                Image(systemName: context.state.playing ? "pause.fill" : "play.fill")
                    .foregroundStyle(waveActivityAccent)
            } minimal: {
                Image(systemName: "waveform")
                    .foregroundStyle(waveActivityAccent)
            }
            .widgetURL(URL(string: "wave://home")!)
            .keylineTint(waveActivityAccent)
        }
        // The compact family also appears on the CarPlay dashboard and the
        // paired Watch Smart Stack; both get the same two-line glancing view.
        .supplementalActivityFamilies([.small])
    }
}

@available(iOS 18.0, *)
struct WaveLiveActivityContent: View {
    @Environment(\.activityFamily) private var family
    let context: ActivityViewContext<WaveActivityAttributes>

    var body: some View {
        if family == .small {
            WaveCarPlaySmallView(context: context)
        } else {
            WaveLockScreenActivityView(context: context)
        }
    }
}

@available(iOS 18.0, *)
struct WaveLockScreenActivityView: View {
    let context: ActivityViewContext<WaveActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(waveLoc("Now Playing"), systemImage: "waveform")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(waveActivityAccent)
                Spacer()
                Image(systemName: context.state.playing ? "pause.fill" : "play.fill")
            }
            Text(context.attributes.title)
                .font(.headline)
                .lineLimit(1)
            Text(context.attributes.artist)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            ProgressView(value: context.state.time, total: max(1, context.state.duration))
                .tint(waveActivityAccent)
            if context.state.mixEnabled {
                Label(waveLoc("Mix"), systemImage: "waveform.path.ecg")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@available(iOS 18.0, *)
struct WaveCarPlaySmallView: View {
    let context: ActivityViewContext<WaveActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(waveLoc("Wave on CarPlay"), systemImage: "waveform")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(waveActivityAccent)
                .lineLimit(1)
            Text(context.attributes.title)
                .font(.footnote.weight(.semibold))
                .lineLimit(1)
            Text(context.attributes.artist)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
    }
}
