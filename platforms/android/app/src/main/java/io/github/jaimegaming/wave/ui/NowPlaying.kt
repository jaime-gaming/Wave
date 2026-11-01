package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.jaimegaming.wave.LyricLine
import io.github.jaimegaming.wave.Player
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.parseLrc

/**
 * Mobile Now Playing: the record above the words, with the transport at the
 * bottom. Native playback, seeking and lyric lookup still belong to the Android
 * player and its service.
 *
 * The screen is one column on a phone and two on anything wider, because the same
 * page on a computer puts the sleeve on one side and the words on the other. A
 * tablet held sideways with a single centred column leaves two thirds of the
 * screen empty and the lyrics stretched into a line nobody can follow.
 */
@OptIn(ExperimentalMaterial3Api::class)
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
    val configuration = LocalConfiguration.current
    val wide = configuration.screenWidthDp >= 600
    // The sleeve is the hero, but never at the price of the words: beside them it
    // takes about a third of the width, above them a little over half.
    val coverSize = if (wide) {
        minOf(configuration.screenHeightDp * 0.44f, configuration.screenWidthDp * 0.3f)
            .coerceIn(96f, 300f).dp
    } else {
        minOf(configuration.screenWidthDp * 0.56f, configuration.screenHeightDp * 0.3f)
            .coerceIn(96f, 240f).dp
    }

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
        NowPlayingHeader(state, onCollapse)
        if (wide) {
            Row(
                modifier = Modifier.fillMaxWidth().weight(1f),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                Column(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    RecordBlock(song, coverSize)
                    SongActions(song, state, onEdit, Modifier.fillMaxWidth().padding(top = 14.dp))
                }
                Column(modifier = Modifier.weight(1.15f).fillMaxHeight()) {
                    LyricsHeading(state)
                    LyricsBody(song, state, lines, active, listState, player, Modifier.weight(1f).fillMaxWidth())
                }
            }
        } else {
            RecordBlock(song, coverSize)
            LyricsHeading(state, Modifier.padding(top = 2.dp))
            LyricsBody(song, state, lines, active, listState, player, Modifier.weight(1f).fillMaxWidth())
            SongActions(song, state, onEdit, Modifier.fillMaxWidth())
        }
        TransportDeck(song, player)
    }
}

@Composable
private fun NowPlayingHeader(state: WaveState, onCollapse: () -> Unit) {
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
}

/**
 * The record and what it is.
 *
 * Records are square and belong in the middle: a centred sleeve with the words
 * under it reads as a record sleeve rather than a list row with a picture in it.
 */
@Composable
private fun RecordBlock(song: Song, coverSize: Dp) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(coverSize)
                .clip(RoundedCornerShape(26.dp))
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .semantics { contentDescription = "${song.title} by ${song.artist}" },
        ) {
            Cover(song, size = coverSize, radius = 26.dp)
        }
        Text(
            song.title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            song.artist,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.9f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )
        if (song.album.isNotBlank()) {
            Text(
                song.album,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun LyricsHeading(state: WaveState, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { state.lyricsOpen = !state.lyricsOpen }.padding(vertical = 8.dp, horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WaveIcon("lyrics", 17.dp, MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(8.dp))
        Text(if (state.lyricsOpen) "Lyrics" else "Show lyrics", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        WaveIcon("collapse", 16.dp, MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LyricsBody(
    song: Song,
    state: WaveState,
    lines: List<LyricLine>,
    active: Int,
    listState: LazyListState,
    player: Player,
    modifier: Modifier,
) {
    if (!state.lyricsOpen) {
        // Closed, the space belongs to the record rather than to an empty reader.
        Spacer(modifier)
        return
    }
    if (song.lyrics.isBlank()) {
        Column(modifier, verticalArrangement = Arrangement.Center) {
            Text("No lyrics yet", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text("Add them yourself, or search online.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            Text(
                if (state.busy) "Looking…" else "Search online",
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { if (!state.busy) state.lookupLyrics(song) }.padding(vertical = 12.dp),
            )
        }
        return
    }
    if (lines.isEmpty()) {
        LazyColumn(modifier = modifier, contentPadding = PaddingValues(vertical = 28.dp)) {
            item { Text(song.lyrics, style = LyricLineStyle, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        return
    }
    LazyColumn(state = listState, modifier = modifier, contentPadding = PaddingValues(vertical = 36.dp)) {
        itemsIndexed(lines) { index, line ->
            val current = index == active
            val sung = MaterialTheme.colorScheme.onSurface
            val upcoming = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
            val words = buildAnnotatedString {
                if (current && line.words.isNotEmpty()) {
                    line.words.forEach { word ->
                        withStyle(SpanStyle(color = if (player.time >= word.time) sung else upcoming)) {
                            append(word.text)
                        }
                    }
                } else append(line.text.ifBlank { "♪" })
            }
            Text(
                text = words,
                style = LyricLineStyle,
                fontWeight = if (current) FontWeight.Bold else FontWeight.SemiBold,
                color = if (current) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { player.seek(line.time) }.padding(vertical = 10.dp),
            )
        }
    }
}

/** The two things you might want from this song while it plays, and nothing else. */
@Composable
private fun SongActions(song: Song, state: WaveState, onEdit: () -> Unit, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onEdit, modifier = Modifier.size(42.dp).semantics { contentDescription = "Edit lyrics" }) {
            WaveIcon("edit", 20.dp, MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = { state.toggleFavorite(song) }, modifier = Modifier.size(42.dp).semantics { contentDescription = if (song.favorite) "Remove from favorites" else "Add to favorites" }) {
            WaveIcon("favorite", 20.dp, if (song.favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Position, the two clocks and the transport, on one surface at the bottom.
 *
 * The opt-in travels with the function: it draws the same Material slider as the
 * screen above it, and an opt-in on the caller does not reach the callee.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransportDeck(song: Song, player: Player) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        val duration = player.duration.takeIf { it > 0 } ?: song.duration.coerceAtLeast(1.0)
        Slider(
            value = player.time.coerceIn(0.0, duration).toFloat(),
            onValueChange = { player.seek(it.toDouble()) },
            valueRange = 0f..duration.toFloat(),
            modifier = Modifier.fillMaxWidth().height(36.dp).semantics { contentDescription = "Song position" },
            thumb = {
                Box(Modifier.size(width = 6.dp, height = 24.dp).clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.primary))
            },
            track = {
                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f))) {
                    Box(Modifier.fillMaxWidth((player.time / duration).coerceIn(0.0, 1.0).toFloat()).height(4.dp).background(MaterialTheme.colorScheme.primary))
                }
            },
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(clockTime(player.time), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(clockTime(duration), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Transport(player)
    }
}
