package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.github.jaimegaming.wave.Song

/**
 * Editing a song, on a phone.
 *
 * Four fields and nothing else: the title, the two names it is filed under, and
 * the lyric. The id, the file and its path are never touched, so correcting a
 * spelling cannot lose the song.
 */
@Composable
fun EditSongDialog(song: Song, onDismiss: () -> Unit, onSave: (Song) -> Unit) {
    var title by remember(song.id) { mutableStateOf(song.title) }
    var artist by remember(song.id) { mutableStateOf(song.artist) }
    var album by remember(song.id) { mutableStateOf(song.album) }
    var lyrics by remember(song.id) { mutableStateOf(song.lyrics) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit song") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                WaveTextField(
                    value = title,
                    onValueChange = { title = it.take(200) },
                    label = "Title",
                    modifier = Modifier.fillMaxWidth(),
                )
                WaveTextField(
                    value = artist,
                    onValueChange = { artist = it.take(200) },
                    label = "Artist",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                )
                WaveTextField(
                    value = album,
                    onValueChange = { album = it.take(200) },
                    label = "Album",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                )
                WaveTextField(
                    value = lyrics,
                    onValueChange = { lyrics = it.take(100_000) },
                    label = "Lyrics",
                    singleLine = false,
                    minLines = 6,
                    supportingText = {
                        Text(
                            text = "Timed lyrics (LRC) are read as they are; plain lines work too.",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp, bottom = 10.dp),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = title.isNotBlank(),
                onClick = {
                    onSave(
                        song.copy(
                            title = title.trim(),
                            artist = artist.trim().ifBlank { "Unknown artist" },
                            album = album.trim().ifBlank { "Unknown album" },
                            lyrics = lyrics,
                            // A lyric typed here is the listener's own: never look
                            // over it again.
                            checkedAt = 0,
                        ),
                    )
                    onDismiss()
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
