package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Playlist
import io.github.jaimegaming.wave.Song

/** One row of a sheet: a verb, and what it does. */
@Composable
private fun SheetAction(label: String, detail: String? = null, dim: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleMedium,
                color = if (dim) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onBackground,
            )
            if (detail != null) {
                Text(
                    text = detail,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheet(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheet,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 28.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
            )
            content()
        }
    }
}

/**
 * The three places music can come from.
 *
 * The choice is explicit and stays explicit: the file picker takes anything the
 * phone offers, "this device's music" reads what the system already indexes, and a
 * folder brings a whole tree in at once. Nothing is downloaded, and nothing is
 * read without one of these taps.
 */
@Composable
fun AddMusicSheet(
    open: Boolean,
    busy: Boolean,
    onDismiss: () -> Unit,
    onFiles: () -> Unit,
    onDevice: () -> Unit,
    onFolder: () -> Unit,
) {
    if (!open) return
    Sheet("Add music", onDismiss) {
        if (busy) {
            Text(
                text = "Working through the files…",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp, bottom = 6.dp),
            )
        }
        SheetAction(
            label = "Choose files",
            detail = "MP3, WAV, M4A, OGG and FLAC from anywhere the phone can read.",
            onClick = onFiles,
        )
        SheetAction(
            label = "This device's music",
            detail = "Add what the system already indexes, where it already is.",
            onClick = onDevice,
        )
        SheetAction(
            label = "A folder",
            detail = "Everything inside it, at any depth.",
            onClick = onFolder,
        )
    }
}

/** Everything that can be done to a song, in one place, without leaving the list. */
@Composable
fun SongOptionsSheet(state: WaveState, onQueue: () -> Unit) {
    val song = state.options ?: return
    var confirmRemoval by remember(song.id) { mutableStateOf(false) }
    if (confirmRemoval) {
        AlertDialog(
            onDismissRequest = { confirmRemoval = false },
            title = { Text("Remove ${song.title}?") },
            text = { Text("This removes the song from Wave and its playlists. The original file outside Wave is not deleted.") },
            confirmButton = {
                TextButton(onClick = { confirmRemoval = false; state.delete(song); state.options = null }) { Text("Remove") }
            },
            dismissButton = { TextButton(onClick = { confirmRemoval = false }) { Text("Keep it") } },
        )
    }
    Sheet(song.title, { state.options = null }) {
        Text(
            text = listOf(song.artist, song.album).filter { it.isNotBlank() }.joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp, bottom = 6.dp),
        )
        SheetAction("Play next", "Puts it after the song that is playing.") {
            state.player.enqueue(song)
            state.options = null
        }
        SheetAction(if (song.favorite) "Remove from favorites" else "Add to favorites") {
            state.toggleFavorite(song)
            state.options = null
        }
        SheetAction("Add to playlist") {
            state.addToPlaylist = song
            state.options = null
        }
        SheetAction("Edit details and lyrics") {
            state.editing = song
            state.options = null
        }
        SheetAction("Show the queue") {
            state.options = null
            onQueue()
        }
        val playlist = state.optionsPlaylist
        if (playlist != null) {
            SheetAction("Remove from ${playlist.name}") {
                state.removeFromPlaylist(playlist, song)
                state.options = null
            }
        }
        SheetAction("Remove from this phone", "Removes the song from Wave after confirmation.", dim = true) {
            confirmRemoval = true
        }
    }
}

/** Adding to a playlist, or starting one with this song already in it. */
@Composable
fun AddToPlaylistSheet(state: WaveState) {
    val song = state.addToPlaylist ?: return
    Sheet("Add to a playlist", { state.addToPlaylist = null }) {
        if (state.playlists.isEmpty()) {
            Text(
                text = "No playlists yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp, bottom = 8.dp),
            )
        }
        LazyColumn(Modifier.heightIn(max = 300.dp)) {
            itemsIndexed(state.playlists, key = { _, item -> item.id }) { _, playlist ->
                SheetAction(playlist.name, "${playlist.trackIds.size} songs") {
                    state.putInPlaylist(playlist, song)
                    state.addToPlaylist = null
                }
            }
        }
        SheetAction("New playlist with this song") {
            state.newPlaylistOpen = true
            state.addToPlaylist = null
        }
    }
}

/** The queue: what plays next, and what can be dropped from it. */
@Composable
fun QueueSheet(state: WaveState, onDismiss: () -> Unit) {
    val queue = state.player.queue
    Sheet("Queue", onDismiss) {
        LazyColumn(Modifier.heightIn(max = 340.dp)) {
            itemsIndexed(queue, key = { _, song -> song.id }) { index, song ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Cover(song, size = 40.dp, radius = 10.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = song.title,
                            style = MaterialTheme.typography.titleMedium,
                            color = if (index == state.player.index) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = song.artist,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (index != state.player.index) {
                        Text(
                            text = "×",
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { state.player.removeAt(index) }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = "Shuffle the queue",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .clickable {
                        state.shuffleAll(queue)
                        onDismiss()
                    }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
fun NewPlaylistDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New playlist") },
        text = {
            WaveTextField(
                value = name,
                onValueChange = { name = it.take(100) },
                placeholder = "Name",
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onCreate(name.ifBlank { "New playlist" }) }) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun PlaylistEditorDialog(playlist: Playlist, onDismiss: () -> Unit, onRename: (String) -> Unit, onDelete: () -> Unit) {
    var name by remember(playlist.id) { mutableStateOf(playlist.name) }
    var confirming by remember(playlist.id) { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (confirming) "Delete ${playlist.name}?" else "Playlist") },
        text = {
            Column {
                if (confirming) {
                    Text(
                        text = "The songs stay in your library; only the list goes.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    WaveTextField(
                        value = name,
                        onValueChange = { name = it.take(100) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Box(Modifier.height(10.dp))
                    Text(
                        text = "Delete this playlist",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { confirming = true }
                            .padding(vertical = 8.dp),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (confirming) onDelete() else onRename(name) },
            ) { Text(if (confirming) "Delete" else "Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
