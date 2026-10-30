package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/* Lucide 24-unit paths, as used by the web client. Lucide is ISC licensed. */
private val iconPaths = mapOf(
    "home" to listOf("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"),
    "search" to listOf("m21 21-4.34-4.34", "M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0"),
    "library" to listOf("m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16"),
    "remix" to listOf("M2 10v3", "M6 6v11", "M10 3v18", "M14 8v7", "M18 5v13", "M22 10v3"),
    "plus" to listOf("M5 12h14", "M12 5v14"),
    "settings" to listOf("M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"),
    "song" to listOf("M4 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M12 18V2l7 4"),
    "album" to listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M6 12c0-1.7.7-3.2 1.8-4.2", "M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M18 12c0 1.7-.7 3.2-1.8 4.2"),
    "artist" to listOf("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87", "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"),
    "playlist" to listOf("M16 5H3", "M11 12H3", "M11 19H3", "M21 16V5", "M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"),
    "favorite" to listOf("M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"),
    "arrow" to listOf("M7 7h10v10", "M7 17 17 7"),
    "play" to listOf("M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"),
    "pause" to listOf("M15 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1z", "M6 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1z"),
    "previous" to listOf("M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z", "M3 20V4"),
    "next" to listOf("M21 4v16", "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"),
    "more" to listOf("M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"),
    "collapse" to listOf("m6 9 6 6 6-6"),
    "edit" to listOf("M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4"),
    "shuffle" to listOf("m18 14 4 4-4 4", "m18 2 4 4-4 4", "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22", "M2 6h1.972a4 4 0 0 1 3.6 2.2", "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"),
    "lyrics" to listOf("M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z", "M7 15h4M15 15h2M7 11h2M13 11h4"),
    "queue" to listOf("M16 5H3", "M11 12H3", "M11 19H3", "M21 16V5", "M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"),
    "back" to listOf("m12 19-7-7 7-7", "M19 12H5"),
)

/** The same line icons as the mobile website, without depending on a font. */
@Composable
fun WaveIcon(name: String, size: Dp = 22.dp, tint: Color = MaterialTheme.colorScheme.onSurface) {
    val paths = remember(name) {
        iconPaths[name].orEmpty().map { PathParser().parsePathString(it).toPath() }
    }
    Canvas(Modifier.size(size)) {
        scale(this.size.width / 24f, this.size.height / 24f, pivot = Offset.Zero) {
            paths.forEach { drawPath(it, tint, style = Stroke(1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        }
    }
}
