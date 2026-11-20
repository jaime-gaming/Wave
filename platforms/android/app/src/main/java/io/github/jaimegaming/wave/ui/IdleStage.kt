package io.github.jaimegaming.wave.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.WavePerformance
import io.github.jaimegaming.wave.formatTime
import io.github.jaimegaming.wave.parseLrc
import io.github.jaimegaming.wave.remixMetrics

/**
 * Wave 3.0's listening room on Android.
 *
 * After thirty seconds without a pointer event the controls are replaced by one
 * lit sleeve, the credits, the active sung line, a Mix cue and a progress line.
 * It is a composition over the same player, not a second Activity, service or
 * audio clock. The automatic lite profile keeps it still and unblurred.
 */
@Composable
fun ImmersiveIdleStage(
    state: WaveState,
    song: Song,
    onWake: () -> Unit,
) {
    val configuration = LocalConfiguration.current
    val profile = LocalWaveProfile.current
    val metrics = remixMetrics(
        configuration.screenWidthDp,
        configuration.screenHeightDp,
        configuration.fontScale,
        profile,
    )
    val ambient = WavePerformance.ambientMotion(profile)
    val transition = rememberInfiniteTransition(label = "idle orbit")
    val orbit by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(24_000, easing = LinearEasing), RepeatMode.Restart),
        label = "idle orbit",
    )
    val labelSp = (metrics.titleSp * .5f).coerceIn(11f, 16f)
    val coverSize = (metrics.coverDp * 1.45f).dp.coerceAtMost(360.dp)
    val time = state.player.time
    val duration = state.player.duration.takeIf { it > 0 } ?: song.duration
    val progress = if (duration > 0) (time / duration).coerceIn(0.0, 1.0).toFloat() else 0f
    val lines = remember(song.lyrics) { parseLrc(song.lyrics) }
    val active = lines.indexOfLast { it.time <= time }
    val accent = MaterialTheme.colorScheme.primary

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onWake)
            .semantics { contentDescription = Loc.t("Immersive listening") },
    ) {
        if (ambient) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            listOf(accent.copy(alpha = .18f), Color.Transparent),
                            radius = 900f,
                        ),
                    ),
            )
            Box(
                Modifier
                    .size((coverSize.value * 1.5f).dp)
                    .align(Alignment.Center)
                    .graphicsLayer { rotationZ = orbit }
                    .border(1.dp, accent.copy(alpha = .18f), RoundedCornerShape(50)),
            )
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = metrics.paddingDp.dp)
                .padding(top = metrics.gapDp.dp, bottom = (metrics.gapDp * 1.5f).dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(coverSize)
                    .clip(RoundedCornerShape((coverSize.value * .16f).dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                contentAlignment = Alignment.Center,
            ) {
                Cover(song, size = coverSize, radius = (coverSize.value * .16f).dp)
            }
            Spacer(Modifier.height(metrics.gapDp.dp))
            Text(
                Loc.t("Now playing"),
                fontSize = labelSp.sp,
                fontWeight = FontWeight.SemiBold,
                color = accent,
            )
            Text(
                song.title,
                fontSize = (metrics.heroSp * .62f).sp,
                lineHeight = (metrics.heroSp * .7f).sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                song.artist,
                fontSize = (metrics.titleSp * .72f).sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (song.album.isNotBlank()) {
                Text(
                    song.album,
                    fontSize = labelSp.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f),
                )
            }
            if (state.mixEnabled) {
                Text(
                    Loc.t("Mix"),
                    fontSize = labelSp.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = accent,
                    modifier = Modifier.padding(top = (metrics.gapDp * .6f).dp),
                )
            }
            if (active >= 0) {
                Text(
                    lines[active].text,
                    fontSize = (metrics.titleSp * .78f).sp,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = metrics.gapDp.dp),
                )
            }
            Spacer(Modifier.height(metrics.gapDp.dp))
            Text(
                "${formatTime(time)} / ${formatTime(duration)}   −${formatTime((duration - time).coerceAtLeast(0.0))}",
                fontSize = labelSp.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(progress)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(accent),
                )
            }
        }
    }
}
