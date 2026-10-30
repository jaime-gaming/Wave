package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.jaimegaming.wave.Player
import io.github.jaimegaming.wave.Song

/** A compact bar that stays visible above the four navigation destinations. */
@Composable
fun MiniPlayer(player: Player, song: Song, onOpen: () -> Unit, onQueue: () -> Unit) {
    val duration = song.duration.coerceAtLeast(1.0)
    val fraction = (player.time / duration).coerceIn(0.0, 1.0).toFloat()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 5.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.primaryContainer)
            .semantics { contentDescription = "Open now playing" }
            .clickable(onClick = onOpen),
    ) {
        Row(
            modifier = Modifier.padding(start = 8.dp, end = 5.dp, top = 6.dp, bottom = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cover(song, size = 42.dp, radius = 10.dp)
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(song.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(song.artist, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            ChromeButton(
                icon = if (player.playing) "pause" else "play",
                label = if (player.playing) "Pause" else "Play",
                onClick = { player.toggle() },
                size = 42.dp,
                background = MaterialTheme.colorScheme.primary,
                tint = MaterialTheme.colorScheme.onPrimary,
            )
            IconButton(onClick = { player.next() }, modifier = Modifier.size(40.dp).semantics { contentDescription = "Next song" }) {
                WaveIcon("next", 20.dp, MaterialTheme.colorScheme.onSurface)
            }
            IconButton(onClick = onQueue, modifier = Modifier.size(40.dp).semantics { contentDescription = "Open queue" }) {
                WaveIcon("queue", 20.dp, MaterialTheme.colorScheme.onSurface)
            }
        }
        Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(bottom = 6.dp).height(2.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.28f))) {
            Box(Modifier.fillMaxWidth(fraction).height(2.dp).background(MaterialTheme.colorScheme.primary))
        }
    }
}

/** The same previous/play/next transport in the full player. */
@Composable
fun Transport(player: Player) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { player.previous() }, modifier = Modifier.size(56.dp).semantics { contentDescription = "Previous song" }) {
            WaveIcon("previous", 23.dp, MaterialTheme.colorScheme.onSurface)
        }
        Spacer(Modifier.width(12.dp))
        ChromeButton(
            icon = if (player.playing) "pause" else "play",
            label = if (player.playing) "Pause" else "Play",
            onClick = { player.toggle() },
            size = 64.dp,
            background = MaterialTheme.colorScheme.primary,
            tint = MaterialTheme.colorScheme.onPrimary,
        )
        Spacer(Modifier.width(12.dp))
        IconButton(onClick = { player.next() }, modifier = Modifier.size(56.dp).semantics { contentDescription = "Next song" }) {
            WaveIcon("next", 23.dp, MaterialTheme.colorScheme.onSurface)
        }
    }
}

/** Minutes and seconds, as a clock reads them. */
fun clockTime(seconds: Double): String {
    if (!seconds.isFinite() || seconds <= 0) return "0:00"
    val total = seconds.toInt()
    val minutes = total / 60
    val rest = total % 60
    return "$minutes:${rest.toString().padStart(2, '0')}"
}
