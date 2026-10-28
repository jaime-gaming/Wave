package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.parseLrc

/**
 * The listening screen.
 *
 * Cover, title, position, transport, then the lyric as a column of text that
 * keeps the sung line centred. No cards around the words and no controls over the
 * artwork: the song is the screen.
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
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val coverSize = (screenWidth - 96).coerceIn(180, 320).dp

    // The sung line brings itself into view; the reader follows the song rather
    // than the song following the scroll.
    LaunchedEffect(active, song.id) {
        if (active >= 0) listState.animateScrollToItem(active + 1)
    }
    LaunchedEffect(song.id) { state.maybeLookupLyrics(song) }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 24.dp),
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "⌄",
                    fontSize = 24.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable(onClick = onCollapse)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
                Text(
                    text = "Now playing",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = if (song.favorite) "♥" else "♡",
                    color = if (song.favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 18.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { state.toggleFavorite(song) }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
            Spacer(Modifier.height(14.dp))
            Cover(song, size = coverSize, radius = 26.dp)
            Spacer(Modifier.height(18.dp))
            Text(
                text = song.title,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = listOf(song.artist, song.album).filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            val duration = song.duration.coerceAtLeast(1.0)
            Slider(
                value = player.time.coerceIn(0.0, duration).toFloat(),
                onValueChange = { player.seek(it.toDouble()) },
                valueRange = 0f..duration.toFloat(),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    text = clockTime(player.time),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = clockTime(duration),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Transport(player)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = if (state.lyricsOpen) "Hide lyrics" else "Show lyrics",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { state.lyricsOpen = !state.lyricsOpen }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
                Text(
                    text = "Edit",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(onClick = onEdit)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
            Spacer(Modifier.height(10.dp))
        }
        if (state.lyricsOpen) {
            if (song.lyrics.isBlank()) {
                item {
                    EmptyState(
                        title = "No lyrics yet",
                        body = "Add them yourself, or ask Wave to look them up.",
                        actionLabel = if (state.busy) "Looking…" else "Search online",
                        onAction = { if (!state.busy) state.lookupLyrics(song) },
                    )
                }
            } else if (lines.isEmpty()) {
                item {
                    Text(
                        text = song.lyrics,
                        style = LyricLineStyle,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 12.dp),
                    )
                }
            } else {
                itemsIndexed(lines) { index, line ->
                    val current = index == active
                    Text(
                        text = line.text.ifBlank { "♪" },
                        style = LyricLineStyle,
                        fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.62f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { player.seek(line.time) }
                            .padding(vertical = 9.dp),
                    )
                }
            }
        }
        item { Spacer(Modifier.height(48.dp)) }
    }
}
