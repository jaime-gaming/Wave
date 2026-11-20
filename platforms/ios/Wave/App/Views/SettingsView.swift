import SwiftUI
import WaveCore

struct SettingsView: View {
    @EnvironmentObject private var state: WaveState
    @Binding var importing: Bool

    var body: some View {
        NavigationStack {
            List {
                Section(WaveTheme.loc("Library")) {
                    Button(WaveTheme.loc("Import music")) { importing = true }
                    NavigationLink(WaveTheme.loc("Queue")) { QueueView() }
                }
                Section(WaveTheme.loc("Playback")) {
                    Toggle(
                        WaveTheme.loc("Mix"),
                        isOn: Binding(get: { state.mixEnabled }, set: { state.mixEnabled = $0 })
                    )
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
                }
            }
            .onDelete { offsets in
                state.removeFromQueue(at: offsets)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(WaveTheme.background)
        .navigationTitle(WaveTheme.loc("Queue"))
    }
}
