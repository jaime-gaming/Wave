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

/*
 * The same line drawings the web client uses, on the same 24-unit grid, so the
 * phone draws Wave's own hand rather than a second, borrowed one. Kept as path
 * data rather than a font: a glyph from a font is whatever the device ships.
 */
private val iconPaths = mapOf(
    "home" to listOf("M3.3 10.7C6 8.1 9 5.5 11.2 4a1.5 1.5 0 0 1 1.7 0c2.2 1.5 5.2 4.1 7.9 6.7", "M5.5 12.4v6.1a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7v-6.1", "M9.7 20.1v-4a2.3 2.3 0 0 1 4.6 0v4"),
    "search" to listOf("M10.6 3.9a6.7 6.7 0 1 1-4.7 2a6.6 6.6 0 0 1 4.7-2", "M15.5 15.3l.9.9 4 3.9"),
    "library" to listOf("M9.6 4.4h6.9a2.2 2.2 0 0 1 2.2 2.2v6.9", "M6.3 8.2h6.4a2.9 2.9 0 0 1 2.9 2.9v5.7a2.9 2.9 0 0 1 -2.9 2.9h-6.4a2.9 2.9 0 0 1 -2.9 -2.9v-5.7a2.9 2.9 0 0 1 2.9 -2.9Z", "M7.3 14a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0"),
    "remix" to listOf("M3.8 10.6v2.8", "M7.4 7.4v9.2", "M11 4.8v14.4", "M14.6 8.2v7.6", "M18.2 10.2v3.6", "M21 11.4v1.2"),
    "plus" to listOf("M12 5.4v13.2", "M5.4 12h13.2"),
    "settings" to listOf("M7 4.2v4.6", "M7 13.2v6.6", "M12 4.2v9.2", "M12 18v1.8", "M17 4.2v2.4", "M17 11v8.8", "M4.7 10.9h4.6", "M9.7 15.9h4.6", "M14.7 9h4.6"),
    "song" to listOf("M14.5 4.9v10.3", "M8.9 17.5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0", "M14.5 4.9c2.7.6 4 2.1 4 4.4"),
    "album" to listOf("M20.7 14.3a9 9 0 1 1-1.3-6.5", "M15.2 12.6a3.4 3.4 0 1 1-2.6-2.9"),
    "artist" to listOf("M5.9 8.4a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0", "M3.6 19.6c0-3.2 2.6-5.3 5.8-5.3s5.8 2.1 5.8 5.3", "M15.7 5.3a3.5 3.5 0 0 1 0 6.2", "M17.4 14.7c1.9.5 3 2 3 4.3"),
    "playlist" to listOf("M4 6.6h9.2", "M4 11.3h9.2", "M4 16h6", "M17.6 12.4v6.2", "M14.5 15.5h6.2"),
    "favorite" to listOf("M12 20.1c-3.6-2.5-7.7-5.4-7.7-9.4a4 4 0 0 1 7.3-2.4c.2.3.6.3.8 0a4 4 0 0 1 7.3 2.4c0 4-4.1 6.9-7.7 9.4Z"),
    "arrow" to listOf("M7.4 16.6 16.5 7.5", "M9.4 7.5h7.1v7.1"),
    "play" to listOf("M7.7 4.9c0-.9 1-1.4 1.7-.9l9 6.2c.7.5.7 1.5 0 2l-9 6.2c-.7.5-1.7 0-1.7-.9Z"),
    "pause" to listOf("M9.3 6.5v11", "M14.7 6.5v11"),
    "previous" to listOf("M6.1 5.8v12.4", "M18.4 6.4v11.2a.9.9 0 0 1-1.4.7l-8-5.5a.9.9 0 0 1 0-1.6l8-5.5a.9.9 0 0 1 1.4.7Z"),
    "next" to listOf("M17.9 5.8v12.4", "M5.6 6.4v11.2a.9.9 0 0 0 1.4.7l8-5.5a.9.9 0 0 0 0-1.6l-8-5.5a.9.9 0 0 0-1.4.7Z"),
    "more" to listOf("M12 6.2h.01", "M12 12h.01", "M12 17.8h.01"),
    "collapse" to listOf("M6.3 9.5 12 15.2l5.7-5.7"),
    "edit" to listOf("M4.9 19.1l.8-4L15.4 5.4a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.9 18.3l-4 .8Z", "M13.9 7.1l3 3"),
    "volume" to listOf("M11 5 6 9H3v6h3l5 4Z", "M15 8a6 6 0 0 1 0 8", "M18 5a10 10 0 0 1 0 14"),
    "mute" to listOf("M11 5 6 9H3v6h3l5 4Z", "M16 9l5 6", "M21 9l-5 6"),
    "shuffle" to listOf("M4 6.9h2.5c1.4 0 2.7.7 3.5 1.9l3.9 6.4c.8 1.2 2.1 1.9 3.5 1.9H20", "M4 17.1h2.5c1.4 0 2.7-.7 3.5-1.9l3.9-6.4c.8-1.2 2.1-1.9 3.5-1.9H20", "M17.7 4.6 20.2 6.9l-2.5 2.3", "M17.7 14.8 20.2 17.1l-2.5 2.3"),
    "lyrics" to listOf("M6.1 5.3h11.8a3.2 3.2 0 0 1 3.2 3.2v7a3.2 3.2 0 0 1 -3.2 3.2h-11.8a3.2 3.2 0 0 1 -3.2 -3.2v-7a3.2 3.2 0 0 1 3.2 -3.2Z", "M9.9 10.3H8a1.7 1.7 0 0 0-1.7 1.7v1.4A1.7 1.7 0 0 0 8 15.1h1.9", "M16.4 10.3h-1.9a1.7 1.7 0 0 0-1.7 1.7v1.4a1.7 1.7 0 0 0 1.7 1.7h1.9"),
    "queue" to listOf("M4 6.6h10.2", "M4 11.3h7.4", "M4 16h5.4", "M14.9 16.5a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0", "M19.5 16.5V7.6"),
    "back" to listOf("M19.2 12H4.9", "M11 5.8 4.8 12 11 18.2"),
    "palette" to listOf("M12 3.8a8.2 8.2 0 1 0 0 16.4c1.5 0 2-1 2-1.9 0-1.6 1.1-2.4 2.5-2.4h1.4a2.2 2.2 0 0 0 2.2-2.2A8 8 0 0 0 12 3.8Z", "M8.1 9.6h.01", "M6.9 13.4h.01", "M11.4 7.3h.01", "M15.3 8.4h.01"),
    "sliders" to listOf("M3.9 7.7h16.2", "M3.9 16.3h16.2", "M6.4 7.7a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0", "M12.8 16.3a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0"),
    "storage" to listOf("M5.9 7.3h12.2a3 3 0 0 1 3 3v3.4a3 3 0 0 1 -3 3h-12.2a3 3 0 0 1 -3 -3v-3.4a3 3 0 0 1 3 -3Z", "M6.4 11.8h1.2", "M10 11.8h1.2"),
    "info" to listOf("M3.6 12a8.4 8.4 0 1 0 16.8 0a8.4 8.4 0 1 0 -16.8 0", "M12 11v5.1", "M12 7.9h.01"),
    "chevron" to listOf("M9.5 5.9 15.6 12l-6.1 6.1"),
)

/** The same line icons as the mobile website, without depending on a font. */
@Composable
fun WaveIcon(name: String, size: Dp = 22.dp, tint: Color = MaterialTheme.colorScheme.onSurface) {
    val paths = remember(name) {
        iconPaths[name].orEmpty().map { PathParser().parsePathString(it).toPath() }
    }
    // The pause bars are two capsules rather than two outlined boxes: at 20 dp an
    // outlined bar is a smudge with a hole in it, so they are drawn heavier.
    val weight = if (name == "pause") 2.6f else 1.8f
    Canvas(Modifier.size(size)) {
        scale(this.size.width / 24f, this.size.height / 24f, pivot = Offset.Zero) {
            paths.forEach { drawPath(it, tint, style = Stroke(weight, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        }
    }
}
