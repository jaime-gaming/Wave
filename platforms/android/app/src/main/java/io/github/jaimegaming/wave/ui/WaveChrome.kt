package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Actions shared by every page header; their implementations stay native. */
class ChromeActions(val addMusic: () -> Unit, val openSettings: () -> Unit)
val LocalChromeActions = staticCompositionLocalOf<ChromeActions?> { null }

/** The inset, rounded page and its softly tinted header, as on mobile web. */
@Composable
fun Modifier.wavePage(): Modifier {
    val surface = MaterialTheme.colorScheme.surface
    val header = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.38f)
    return this
        .fillMaxSize()
        .padding(horizontal = 10.dp)
        .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
        .background(surface)
        .drawBehind {
            val height = 124.dp.toPx()
            drawRect(
                brush = Brush.verticalGradient(listOf(header, Color.Transparent), endY = height),
                size = Size(size.width, height),
            )
        }
}

/** A round header control with a spoken name and the same line art as web. */
@Composable
fun ChromeButton(
    icon: String,
    label: String,
    onClick: () -> Unit,
    size: Dp = 44.dp,
    background: Color = MaterialTheme.colorScheme.primaryContainer,
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(50))
            .background(background)
            .semantics { contentDescription = label }
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        WaveIcon(icon, size = 22.dp, tint = tint)
    }
}

/** Four destinations; Settings belongs in the header, not a fifth tab. */
@Composable
fun WaveNavigation(destination: Destination, onDestination: (Destination) -> Unit) {
    val destinations = listOf(
        Destination.Home to "home",
        Destination.Search to "search",
        Destination.Library to "library",
        Destination.Remix to "remix",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 12.dp, bottom = 12.dp)
            .height(80.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        destinations.forEach { (place, icon) ->
            val selected = destination == place
            Column(
                modifier = Modifier
                    .weight(1f)
                    .height(70.dp)
                    .semantics { this.selected = selected }
                    .clickable(role = Role.Tab) { onDestination(place) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(66.dp)
                        .height(29.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    WaveIcon(icon, 22.dp, if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    text = place.label,
                    color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    maxLines = 1,
                )
            }
        }
    }
}
