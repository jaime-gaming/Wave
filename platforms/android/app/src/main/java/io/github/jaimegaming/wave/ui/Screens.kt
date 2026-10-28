package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.jaimegaming.wave.Song

@Composable
fun HomeScreen(state: WaveState, onAddMusic: () -> Unit, onOpenSong: (Song) -> Unit) {
    val songs = state.songs
    val recent = songs.takeLast(8).reversed()
    val favorites = songs.filter { it.favorite }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Home",
                subtitle = when {
                    songs.isEmpty() -> "Nothing here yet"
                    else -> "${songs.size} songs · ${songs.map { it.artist to it.album }.distinct().size} albums"
                },
            )
        }
        if (songs.isEmpty()) {
            item {
                EmptyState(
                    title = "Your library is empty",
                    body = "Wave plays the files on this phone. Nothing is uploaded and nothing is streamed.",
                    actionLabel = "Add music",
                    onAction = onAddMusic,
                )
            }
            return@LazyColumn
        }
        val current = state.player.current?.let { playing -> songs.find { it.id == playing.id } }
        if (current != null) {
            item {
                SectionTitle("Playing now")
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(20.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                        .clickable { state.nowPlayingOpen = true }
                        .padding(12.dp),
                ) {
                    Cover(current, size = 72.dp, radius = 16.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = current.title,
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = current.artist,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "${clockTime(state.player.time)} / ${clockTime(current.duration)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        }
        if (favorites.isNotEmpty()) {
            item {
                SectionTitle("Favorites", action = "All songs", onAction = { state.destination = Destination.Library })
                LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(favorites, key = { it.id }) { song ->
                        CoverTile(song, onOpenSong)
                    }
                }
            }
        }
        item {
            SectionTitle(
                text = "Recently added",
                action = if (songs.size > 6) "All songs" else null,
                onAction = if (songs.size > 6) ({ state.destination = Destination.Library }) else null,
            )
        }
        items(recent, key = { "recent-" + it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.editing = song },
            )
        }
    }
}

@Composable
private fun CoverTile(song: Song, onOpen: (Song) -> Unit) {
    Column(
        modifier = Modifier
            .width(124.dp)
            .clip(RoundedCornerShape(16.dp))
            .clickable { onOpen(song) },
    ) {
        Cover(song, size = 124.dp, radius = 16.dp)
        Text(
            text = song.title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            text = song.artist,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun LibraryScreen(state: WaveState, onAddMusic: () -> Unit, onOpenSong: (Song) -> Unit) {
    val visible = state.visible()
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Library",
                subtitle = if (state.query.isBlank()) "${state.songs.size} songs" else "${visible.size} of ${state.songs.size} songs",
            )
            OutlinedTextField(
                value = state.query,
                onValueChange = { state.query = it },
                label = { Text("Search songs, artists, albums") },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
            )
        }
        if (visible.isEmpty()) {
            item {
                if (state.songs.isEmpty()) {
                    EmptyState(
                        title = "Nothing to play yet",
                        body = "Add the files already on this phone to hear them here.",
                        actionLabel = "Add music",
                        onAction = onAddMusic,
                    )
                } else {
                    EmptyState(
                        title = "No matching songs",
                        body = "Try a shorter word, or clear the search.",
                        actionLabel = "Clear search",
                        onAction = { state.query = "" },
                    )
                }
            }
        }
        items(visible, key = { it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.editing = song },
            )
        }
    }
}

@Composable
fun SettingsScreen(state: WaveState, version: String, onAddMusic: () -> Unit) {
    val albums = state.songs.map { it.album }.distinct().size
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item { ScreenTitle(title = "Settings") }
        item {
            SectionTitle("Playback")
            SettingSwitch(
                title = "Mix",
                detail = "One song blends into the next instead of stopping between them.",
                checked = state.mixEnabled,
                onChange = { state.setMix(it) },
            )
            Divider()
        }
        item {
            SectionTitle("Lyrics")
            SettingSwitch(
                title = "Look up lyrics online",
                detail = "Off by default. When on, Wave asks a lyric service for the current song only.",
                checked = state.onlineLyrics,
                onChange = { state.setOnlineLyrics(it) },
            )
            Divider()
        }
        item {
            SectionTitle("Library")
            StatRow(
                state.songs.size.toString() to "songs",
                albums.toString() to "albums",
                state.songs.count { it.favorite }.toString() to "favorites",
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp),
            ) {
                Text(
                    text = "Add music",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(onClick = onAddMusic)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }
            Divider()
        }
        item {
            SectionTitle("About")
            Body("Wave $version")
            Body("Your files stay on this phone. Nothing is uploaded, and Mix only changes how playback is joined.")
            Spacer(Modifier.height(18.dp))
        }
    }
}
