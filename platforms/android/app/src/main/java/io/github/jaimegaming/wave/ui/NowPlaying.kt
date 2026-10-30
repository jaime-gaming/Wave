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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.parseLrc

/**
 * Mobile Now Playing: record and metadata above a frameless lyric, with the
 * transport fixed at the bottom. Native playback, seeking and lyric lookup are
 * still handled by the Android player and its service.
 */
@Composable
fun NowPlayingScreen(
    song: Song,
    state: WaveState,
    onCollapse: () -> Unit,
    onEdit: () -> Unit,
) {
    val player = state.player
    val listState = rememberLazyListState()
    val lines = remember(song.lyrics) { parseLrc(song.lyrics) }
    val active = lines.indexOfLast { it.time <= player.time }
    val coverSize = (LocalConfiguration.current.screenWidthDp * 0.44f).coerceIn(110f, 172f).dp

    LaunchedEffect(active, song.id) {
        if (active >= 0) listState.animateScrollToItem(active)
    }
    LaunchedEffect(song.id) { state.maybeLookupLyrics(song) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Now playing",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            ChromeButton("queue", "Open queue", { state.queueOpen = true }, background = MaterialTheme.colorScheme.surfaceContainerHigh, tint = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.width(8.dp))
            ChromeButton("collapse", "Close now playing", onCollapse, background = MaterialTheme.colorScheme.surfaceContainerHigh, tint = MaterialTheme.colorScheme.onSurface)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cover(song, size = coverSize, radius = 20.dp)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(song.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(song.artist, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                if (song.album.isNotBlank()) {
                    Text(song.album, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { state.lyricsOpen = !state.lyricsOpen }.padding(vertical = 8.dp, horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WaveIcon("lyrics", 17.dp, MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(8.dp))
            Text(if (state.lyricsOpen) "Lyrics" else "Show lyrics", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            WaveIcon("collapse", 16.dp, MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (state.lyricsOpen) {
            if (song.lyrics.isBlank()) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                    Text("No lyrics yet", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text("Add them yourself, or search online.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    Text(
                        if (state.busy) "Looking…" else "Search online",
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { if (!state.busy) state.lookupLyrics(song) }.padding(vertical = 12.dp),
                    )
                }
            } else if (lines.isEmpty()) {
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(vertical = 28.dp)) {
                    item { Text(song.lyrics, style = LyricLineStyle, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            } else {
                LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(vertical = 36.dp)) {
                    itemsIndexed(lines) { index, line ->
                        val current = index == active
                        Text(
                            text = line.text.ifBlank { "♪" },
                            style = LyricLineStyle,
                            fontWeight = if (current) FontWeight.Bold else FontWeight.SemiBold,
                            color = if (current) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { player.seek(line.time) }.padding(vertical = 10.dp),
                        )
                    }
                }
            }
        } else {
            Spacer(Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onEdit, modifier = Modifier.size(42.dp).semantics { contentDescription = "Edit lyrics" }) {
                WaveIcon("edit", 20.dp, MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { state.toggleFavorite(song) }, modifier = Modifier.size(42.dp).semantics { contentDescription = if (song.favorite) "Remove from favorites" else "Add to favorites" }) {
                WaveIcon("favorite", 20.dp, if (song.favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(horizontal = 16.dp, vertical = 4.dp),
        ) {
            val duration = player.duration.takeIf { it > 0 } ?: song.duration.coerceAtLeast(1.0)
            Slider(
                value = player.time.coerceIn(0.0, duration).toFloat(),
                onValueChange = { player.seek(it.toDouble()) },
                valueRange = 0f..duration.toFloat(),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Song position" },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(clockTime(player.time), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(clockTime(duration), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Transport(player)
        }
    }
}
