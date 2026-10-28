package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Wave's palette on Android.
 *
 * The web build tints everything from the current song's artwork. A phone does
 * not have that much room to be clever in, so the base is a calm ink-and-paper
 * pair and the song brings a single accent [accentFor] that is derived from the
 * sleeve — one hue, used for the playing row, the progress line and the mark.
 */

/** The accent a song brings with it, stable for the same id. */
fun accentFor(id: String): Color {
    val hue = (id.take(6).fold(0) { acc, c -> (acc * 31 + c.code) and 0xFFFF } % 360).toFloat()
    return Color.hsl(hue, 0.42f, 0.68f)
}

private val Ink = Color(0xFF0F131C)
private val InkRaised = Color(0xFF171C27)
private val InkSoft = Color(0xFF222836)
private val Paper = Color(0xFFF7F5F1)
private val PaperRaised = Color(0xFFFFFFFF)
private val PaperSoft = Color(0xFFEDEAE4)
private val Aqua = Color(0xFF9DCAFF)
private val AquaDeep = Color(0xFF1F5FA8)
private val Mist = Color(0xFFA9B0C0)
private val MistDeep = Color(0xFF5A6373)

private val Dark = darkColorScheme(
    primary = Aqua,
    onPrimary = Color(0xFF06203C),
    primaryContainer = Color(0xFF233A55),
    onPrimaryContainer = Color(0xFFD6E6FF),
    secondary = Color(0xFFBFC7D8),
    onSecondary = Color(0xFF1A1F29),
    background = Ink,
    onBackground = Color(0xFFE8EAF1),
    surface = Ink,
    onSurface = Color(0xFFE8EAF1),
    surfaceVariant = InkSoft,
    onSurfaceVariant = Mist,
    surfaceContainer = InkRaised,
    surfaceContainerHigh = InkSoft,
    outline = Color(0xFF39414F),
    outlineVariant = Color(0xFF272E3A),
    error = Color(0xFFFFB4AB),
)

private val Light = lightColorScheme(
    primary = AquaDeep,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD9E7FA),
    onPrimaryContainer = Color(0xFF0A2A4A),
    secondary = Color(0xFF4B5464),
    onSecondary = Color.White,
    background = Paper,
    onBackground = Color(0xFF14181F),
    surface = Paper,
    onSurface = Color(0xFF14181F),
    surfaceVariant = PaperSoft,
    onSurfaceVariant = MistDeep,
    surfaceContainer = PaperRaised,
    surfaceContainerHigh = PaperSoft,
    outline = Color(0xFFC9C4BB),
    outlineVariant = Color(0xFFE0DCD4),
)

private val WaveTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 34.sp,
        lineHeight = 40.sp,
        letterSpacing = (-0.8).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 26.sp,
        lineHeight = 32.sp,
        letterSpacing = (-0.5).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 19.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.2).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 21.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.2.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp,
    ),
)

/** Lyrics need air between lines; everything else stays tight. */
val LyricLineStyle = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontSize = 22.sp,
    lineHeight = 30.sp,
    letterSpacing = (-0.1).sp,
    lineHeightStyle = LineHeightStyle(
        alignment = LineHeightStyle.Alignment.Center,
        trim = LineHeightStyle.Trim.None,
    ),
)

private val WaveShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(24.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(32.dp),
)

@Composable
fun WaveTheme(
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (dark) Dark else Light,
        typography = WaveTypography,
        shapes = WaveShapes,
        content = content,
    )
}
