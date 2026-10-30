package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.R

/**
 * The typeface, the same one the web build loads.
 *
 * Wave ships Nunito Sans (SIL Open Font License, see assets/licenses) on every
 * platform, four static weights cut from the same variable font the web uses.
 * That is the single largest reason a phone screenshot and a browser screenshot
 * of the same screen look like the same product.
 */
private val NunitoSans = FontFamily(
    Font(R.font.nunito_sans_regular, FontWeight.Normal),
    Font(R.font.nunito_sans_medium, FontWeight.Medium),
    Font(R.font.nunito_sans_semibold, FontWeight.SemiBold),
    Font(R.font.nunito_sans_bold, FontWeight.Bold),
)

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

// The web palette, verbatim: the browser tokens in src/styles.css are the only
// source of truth for colour, and these are the same values.
private val Ink = Color(0xFF10141F) // --background
private val InkRaised = Color(0xFF1D2230) // --container
private val InkSoft = Color(0xFF282E3E) // --container-high
private val Paper = Color(0xFFECEDF5) // --background, light
private val PaperRaised = Color(0xFFFAF9FF) // --surface, light
private val PaperSoft = Color(0xFFE1E2EF) // --container-high, light
private val Aqua = Color(0xFFB0C7FF) // --primary
private val AquaDeep = Color(0xFF375D98) // --primary, light
private val Mist = Color(0xFFACB2C4) // --muted
private val MistDeep = Color(0xFF555D70) // --muted, light

private val Dark = darkColorScheme(
    primary = Aqua,
    onPrimary = Color(0xFF092E62),
    primaryContainer = Color(0xFF324773),
    onPrimaryContainer = Color(0xFFE3E5F1),
    secondary = Color(0xFFE9DDFF),
    onSecondary = Color(0xFF484168),
    secondaryContainer = Color(0xFF484168),
    onSecondaryContainer = Color(0xFFE9DDFF),
    background = Ink,
    onBackground = Color(0xFFE3E5F1),
    surface = Ink,
    onSurface = Color(0xFFE3E5F1),
    surfaceVariant = InkSoft,
    onSurfaceVariant = Mist,
    surfaceContainer = InkRaised,
    surfaceContainerHigh = InkSoft,
    outline = Color(0xFF697185),
    outlineVariant = Color(0xFF363D4E),
    error = Color(0xFFFFB4AB),
)

private val Light = lightColorScheme(
    primary = AquaDeep,
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFCCDDFF),
    onPrimaryContainer = Color(0xFF1A1D2B),
    secondary = Color(0xFF403657),
    onSecondary = Color(0xFFE5DBFF),
    secondaryContainer = Color(0xFFE5DBFF),
    onSecondaryContainer = Color(0xFF403657),
    background = Paper,
    onBackground = Color(0xFF1A1D2B),
    surface = PaperRaised,
    onSurface = Color(0xFF1A1D2B),
    surfaceVariant = PaperSoft,
    onSurfaceVariant = MistDeep,
    surfaceContainer = Color(0xFFEDECF5),
    surfaceContainerHigh = PaperSoft,
    outline = Color(0xFF7E8597),
    outlineVariant = Color(0xFFD8D9E6),
    error = Color(0xFFB3261E),
)

private val WaveTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 34.sp,
        lineHeight = 40.sp,
        letterSpacing = (-0.8).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 26.sp,
        lineHeight = 32.sp,
        letterSpacing = (-0.5).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.Medium,
        fontSize = 19.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.2).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 21.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.2.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = NunitoSans,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp,
    ),
)

/** Lyrics need air between lines; everything else stays tight. */
val LyricLineStyle = TextStyle(
    fontFamily = NunitoSans,
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

class AppearanceChoice(val mode: String, val select: (String) -> Unit)
val LocalAppearanceChoice = staticCompositionLocalOf<AppearanceChoice?> { null }

@Composable
fun WaveTheme(
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val preferences = remember(context) { context.getSharedPreferences("wave", android.content.Context.MODE_PRIVATE) }
    var mode by remember(preferences) { mutableStateOf(preferences.getString("appearance", "system") ?: "system") }
    val darkTheme = when (mode) { "dark" -> true; "light" -> false; else -> dark }
    val choice = AppearanceChoice(mode) { next ->
        if (next in setOf("system", "light", "dark")) {
            mode = next
            preferences.edit().putString("appearance", next).apply()
        }
    }
    CompositionLocalProvider(LocalAppearanceChoice provides choice) {
        MaterialTheme(
            colorScheme = if (darkTheme) Dark else Light,
            typography = WaveTypography,
            shapes = WaveShapes,
            content = content,
        )
    }
}
