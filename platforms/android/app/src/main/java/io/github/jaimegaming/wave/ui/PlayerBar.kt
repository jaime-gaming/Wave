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
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Player
import io.github.jaimegaming.wave.Song

/**
 * The bar that is always there.
 *
 * It sits above the navigation, never over the content, and it never hides
 * itself: a player whose controls disappear is a player you cannot trust. The
 * thin line at its top is the position, so the bar answers "where are we" without
 * opening anything.
 */
@Composable
fun MiniPlayer(player: Player, song: Song, onOpen: () -> Unit) {
    val duration = song.duration.coerceAtLeast(1.0)
    val fraction = (player.time / duration).coerceIn(0.0, 1.0).toFloat()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(onClick = onOpen),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction)
                    .height(2.dp)
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cover(song, size = 42.dp, radius = 10.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = song.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
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
            IconButton(onClick = { player.previous() }) {
                Text("⏮", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FilledIconButton(
                onClick = { player.toggle() },
                modifier = Modifier.size(42.dp),
            ) {
                Text(
                    text = if (player.playing) "❚❚" else "▶",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
            IconButton(onClick = { player.next() }) {
                Text("⏭", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Transport used by the now-playing screen: bigger, same order, same labels. */
@Composable
fun Transport(player: Player) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { player.previous() }, modifier = Modifier.size(56.dp)) {
            Text("⏮", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(18.dp))
        FilledIconButton(onClick = { player.toggle() }, modifier = Modifier.size(68.dp)) {
            Text(
                text = if (player.playing) "❚❚" else "▶",
                fontSize = 20.sp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        }
        Spacer(Modifier.width(18.dp))
        IconButton(onClick = { player.next() }, modifier = Modifier.size(56.dp)) {
            Text("⏭", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
