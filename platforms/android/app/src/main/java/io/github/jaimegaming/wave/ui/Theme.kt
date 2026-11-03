package io.github.jaimegaming.wave.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
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
import io.github.jaimegaming.wave.WaveApplication

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

/** Match the active HSL tokens in the mobile website, not the older fallback palette. */
private fun darkPalette(hue: Float) = darkColorScheme(
    primary = Color.hsl(hue, .58f, .80f),
    onPrimary = Color.hsl(hue, .40f, .18f),
    primaryContainer = Color.hsl(hue, .32f, .27f),
    onPrimaryContainer = Color.hsl(hue, .25f, .94f),
    secondary = Color.hsl(hue, .25f, .94f),
    onSecondary = Color.hsl(hue, .24f, .25f),
    secondaryContainer = Color.hsl(hue, .24f, .25f),
    onSecondaryContainer = Color.hsl(hue, .25f, .94f),
    background = Color.hsl(hue, .18f, .09f),
    onBackground = Color.hsl(hue, .25f, .94f),
    surface = Color.hsl(hue, .18f, .12f),
    onSurface = Color.hsl(hue, .25f, .94f),
    surfaceVariant = Color.hsl(hue, .20f, .21f),
    onSurfaceVariant = Color.hsl(hue, .18f, .74f),
    surfaceContainer = Color.hsl(hue, .19f, .16f),
    surfaceContainerHigh = Color.hsl(hue, .20f, .21f),
    outline = Color(0xFF697185),
    outlineVariant = Color.hsl(hue, .18f, .30f),
    error = Color(0xFFFFB4AB),
)

private fun lightPalette(hue: Float) = lightColorScheme(
    primary = Color.hsl(hue, .48f, .35f),
    onPrimary = Color.White,
    primaryContainer = Color.hsl(hue, .40f, .86f),
    onPrimaryContainer = Color.hsl(hue, .28f, .15f),
    secondary = Color.hsl(hue, .28f, .15f),
    onSecondary = Color.White,
    secondaryContainer = Color.hsl(hue, .24f, .89f),
    onSecondaryContainer = Color.hsl(hue, .28f, .15f),
    background = Color.hsl(hue, .25f, .96f),
    onBackground = Color.hsl(hue, .28f, .15f),
    surface = Color.hsl(hue, .30f, .99f),
    onSurface = Color.hsl(hue, .28f, .15f),
    surfaceVariant = Color.hsl(hue, .27f, .87f),
    onSurfaceVariant = Color.hsl(hue, .18f, .36f),
    surfaceContainer = Color.hsl(hue, .28f, .92f),
    surfaceContainerHigh = Color.hsl(hue, .27f, .87f),
    outline = Color.hsl(hue, .18f, .53f),
    outlineVariant = Color.hsl(hue, .18f, .78f),
    error = Color(0xFFB3261E),
)

/** Coarse artwork sample, using the same chroma weighting as the web. */
internal fun artworkHue(bitmap: android.graphics.Bitmap?): Float {
    if (bitmap == null || bitmap.width <= 0 || bitmap.height <= 0) return 226f
    var red = 0.0
    var green = 0.0
    var blue = 0.0
    var weight = 0.0
    for (y in 0 until 12) for (x in 0 until 12) {
        val pixel = bitmap.getPixel(x * (bitmap.width - 1) / 11, y * (bitmap.height - 1) / 11)
        val r = android.graphics.Color.red(pixel) / 255.0
        val g = android.graphics.Color.green(pixel) / 255.0
        val b = android.graphics.Color.blue(pixel) / 255.0
        val chroma = maxOf(r, g, b) - minOf(r, g, b)
        val w = chroma + .05
        red += r * w; green += g * w; blue += b * w; weight += w
    }
    val r = red / weight; val g = green / weight; val b = blue / weight
    val max = maxOf(r, g, b); val min = minOf(r, g, b); val delta = max - min
    if (delta <= .01) return 220f
    val raw = when (max) {
        r -> ((g - b) / delta) % 6
        g -> (b - r) / delta + 2
        else -> (r - g) / delta + 4
    } * 60
    return ((kotlin.math.round(raw).toFloat() % 360f) + 360f) % 360f
}

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
    val song = (context.applicationContext as? WaveApplication)?.player?.current
    val artwork = song?.let { rememberArtwork(it) }
    val sampledHue = remember(artwork) { artworkHue(artwork) }
    var targetHue by remember { mutableStateOf(226f) }
    LaunchedEffect(sampledHue, song?.id, artwork) {
        // Give the new sleeve a moment to load rather than flashing the neutral
        // palette between two songs. The delay is cancelled when artwork arrives.
        if (song != null && artwork == null) kotlinx.coroutines.delay(180)
        val current = ((targetHue % 360f) + 360f) % 360f
        val distance = ((sampledHue - current + 540f) % 360f) - 180f
        targetHue += distance
    }
    val animatedHue by animateFloatAsState(targetValue = targetHue, animationSpec = tween(500), label = "song colour")
    val hue = ((animatedHue % 360f) + 360f) % 360f
    val choice = AppearanceChoice(mode) { next ->
        if (next in setOf("system", "light", "dark")) {
            mode = next
            preferences.edit().putString("appearance", next).apply()
        }
    }
    CompositionLocalProvider(LocalAppearanceChoice provides choice) {
        MaterialTheme(
            colorScheme = if (darkTheme) darkPalette(hue) else lightPalette(hue),
            typography = WaveTypography,
            shapes = WaveShapes,
            content = content,
        )
    }
}
