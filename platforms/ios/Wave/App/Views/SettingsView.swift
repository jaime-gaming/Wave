import SwiftUI
import WaveCore

struct SettingsView: View {
    @EnvironmentObject private var state: WaveState
    @Binding var importing: Bool
    @AppStorage("wave.appearance") private var appearance = "system"

    var body: some View {
        NavigationStack {
            List {
                Section(WaveTheme.loc("Library")) {
                    Button(WaveTheme.loc("Import music")) { importing = true }
                    NavigationLink(WaveTheme.loc("Queue")) { QueueView() }
                }
                Section(WaveTheme.loc("Appearance")) {
                    Picker(WaveTheme.loc("Theme"), selection: $appearance) {
                        Text(WaveTheme.loc("System")).tag("system")
                        Text(WaveTheme.loc("Light")).tag("light")
                        Text(WaveTheme.loc("Dark")).tag("dark")
                    }
                }
                Section(WaveTheme.loc("Playback")) {
                    Toggle(
                        WaveTheme.loc("Mix"),
                        isOn: Binding(get: { state.mixEnabled }, set: { state.mixEnabled = $0 })
                    )
                    .tint(WaveTheme.accent)
                    Toggle(isOn: Binding(get: { state.autoplayEnabled }, set: { state.autoplayEnabled = $0 })) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(WaveTheme.loc("Autoplay"))
                            Text(WaveTheme.loc("Continue with another song from your local library when the queue ends."))
                                .font(.footnote)
                                .foregroundStyle(WaveTheme.muted)
                        }
                    }
                    .tint(WaveTheme.accent)
                    Toggle(
                        WaveTheme.loc("Shuffle"),
                        isOn: Binding(get: { state.shuffle }, set: { state.shuffle = $0 })
                    )
                    .tint(WaveTheme.accent)
                    Picker(
                        WaveTheme.loc("Repeat"),
                        selection: Binding(get: { state.repeatMode }, set: { state.repeatMode = $0 })
                    ) {
                        Text(WaveTheme.loc("Off")).tag(RepeatMode.off)
                        Text(WaveTheme.loc("All")).tag(RepeatMode.all)
                        Text(WaveTheme.loc("One")).tag(RepeatMode.one)
                    }
                }
                Section(WaveTheme.loc("Lyrics")) {
                    Toggle(isOn: Binding(get: { state.automaticLyricsEnabled }, set: { state.automaticLyricsEnabled = $0 })) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(WaveTheme.loc("Automatic lyrics"))
                            Text(WaveTheme.loc("Look up missing lyrics for the song you play. Its title and artist are sent to LRCLIB; your audio stays here."))
                                .font(.footnote)
                                .foregroundStyle(WaveTheme.muted)
                        }
                    }
                    .tint(WaveTheme.accent)
                }
                Section(WaveTheme.loc("About")) {
                    HStack {
                        Text(WaveTheme.loc("Version"))
                        Spacer()
                        Text(WaveTheme.version)
                            .foregroundStyle(WaveTheme.muted)
                    }
                    Text(WaveTheme.loc("Your music stays on this device. Wave does not upload your library or lyrics."))
                        .font(.footnote)
                        .foregroundStyle(WaveTheme.muted)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(WaveTheme.background.ignoresSafeArea())
            .navigationTitle(WaveTheme.loc("Settings"))
        }
    }
}

struct QueueView: View {
    @EnvironmentObject private var state: WaveState

    var body: some View {
        List {
            ForEach(Array(state.queue.enumerated()), id: \.offset) { _, id in
                if let song = state.song(with: id) {
                    SongRow(song: song) { state.play(song) }
                        .deleteDisabled(song.id == state.currentID || state.player.mixProgress != nil)
                        .moveDisabled(state.player.mixProgress != nil)
                }
            }
            .onDelete { offsets in
                state.removeFromQueue(at: offsets)
            }
            .onMove { offsets, destination in
                state.moveInQueue(from: offsets, to: destination)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(WaveTheme.background)
        .navigationTitle(WaveTheme.loc("Queue"))
        .toolbar { EditButton() }
    }
}
