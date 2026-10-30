package io.github.jaimegaming.wave.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import io.github.jaimegaming.wave.Library
import io.github.jaimegaming.wave.Play
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.WaveApplication
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * Real captures of the phone app, drawn by the phone app.
 *
 * The documentation needs screenshots of Android, and a screenshot of a design
 * that only exists in a headless JVM is not a screenshot of Android. So this
 * renders the same [WaveApp] the phone renders, on the real Robolectric graphics
 * stack, from a seeded library that is thrown away with the build directory. It
 * runs only when `-Dwave.screenshots` is passed, so an ordinary test run stays
 * fast, and it asserts nothing about pixels: a human looks at the PNGs.
 *
 * The artwork is drawn the way it is drawn on a phone with no embedded covers —
 * a music-note placeholder — because the fixture files contain no artwork.
 * Nothing here is a mock-up and nothing is retouched.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class ScreenshotTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    // One test per screen: an activity may only be given content once, and JUnit
    // builds a fresh one for each test.
    @Test
    fun home() = capture("android-home", Opening.Default)

    @Test
    fun homeLight() = capture("android-home-light", Opening.Default, dark = false)

    @Test
    fun remix() = capture("android-remix", Opening.Where(Destination.Remix))

    @Test
    fun library() = capture("android-library", Opening.Where(Destination.Library))

    @Test
    fun settings() = capture("android-settings", Opening.Where(Destination.Settings))

    @Test
    fun player() = capture("android-now-playing", Opening.Player)

    @Test
    fun homeUsesTheMobileWebNavigation() {
        val output = output() ?: return
        seed(ApplicationProvider.getApplicationContext<WaveApplication>(), output)
        rule.setContent { WaveTheme { WaveApp(version = "0.1.1") } }
        rule.onNodeWithText("Your collection").assertExists()
        rule.onNodeWithText("Jump back in").assertDoesNotExist()
        rule.onNodeWithContentDescription("Open settings").performClick()
        rule.onNodeWithText("Settings").assertExists()
        rule.onNodeWithText("Appearance").performClick()
        rule.onNodeWithText("Dark").performClick()
        val app = ApplicationProvider.getApplicationContext<WaveApplication>()
        org.junit.Assert.assertEquals("dark", app.preferences().getString("appearance", null))
        rule.onNodeWithText("Home").performClick()
        rule.onNodeWithText("Your collection").assertExists()
        rule.onNodeWithText("Daily mix 1").performClick()
        rule.onNodeWithText("Play mix").assertExists()
        rule.onNodeWithText("Save as playlist").performClick()
        rule.onNodeWithText("Daily mix saved as a playlist.").assertExists()
    }

    @Test
    fun remixReadsAsOnePage() {
        val output = output() ?: return
        seed(ApplicationProvider.getApplicationContext<WaveApplication>(), output)
        rule.setContent { WaveTheme { WaveApp(version = "0.1.1") } }
        rule.onNodeWithText("Remix").performClick()
        // The figure, the sleeve of the song that earned it, and a list.
        rule.onNodeWithText("MOST PLAYED").assertExists()
        rule.onNodeWithText("Your Remix").assertExists()
        rule.onNodeWithText("Play Remix").assertExists()
        // The stat-card sections the page used to have are gone.
        rule.onNodeWithText("More about this week").assertDoesNotExist()
        rule.onNodeWithText("Artists this week").assertDoesNotExist()
        rule.onNodeWithText("When you listen").assertDoesNotExist()
    }

    private fun output(): File? {
        val flag = System.getProperty("wave.screenshots").orEmpty()
        assumeTrue("Pass -Dwave.screenshots=<directory> to capture.", flag.isNotEmpty())
        return File(flag).apply { mkdirs() }
    }

    /** A small library and a week of plays, written through the app's own files. */
    private fun seed(app: WaveApplication, output: File) {
        val library = Library(app)
        app.preferences().edit().remove("appearance").apply()
        // The same demo library the web captures use: three artists, an album each.
        val songs = listOf(
            Triple("After hours", "Northbound", "Night signals"),
            Triple("Slow motion", "Northbound", "Night signals"),
            Triple("Open skies", "Northbound", "Night signals"),
            Triple("First light", "Sunday Club", "Soft light"),
            Triple("Blue room", "Sunday Club", "Soft light"),
            Triple("Quiet streets", "Sunday Club", "Soft light"),
            Triple("Home again", "The Coastline", "In the distance"),
            Triple("Out of town", "The Coastline", "In the distance"),
            Triple("Paper maps", "The Coastline", "In the distance"),
        ).mapIndexed { index, (title, artist, album) ->
            Song(
                id = "demo-$index",
                title = title,
                artist = artist,
                album = album,
                filename = "$title.wav",
                path = File(output, "demo-$index.wav").absolutePath,
                duration = 120.0,
                lyrics = "[00:00.00]<00:00.00>The city <00:01.50>slows <00:03.00>beneath the light\n[00:05.00]We take the long way home tonight",
                genre = listOf("Electronic", "Jazz", "Rock")[index / 3],
                addedAt = System.currentTimeMillis() - index * 86_400_000L,
            )
        }
        library.savePlaylists(emptyList())
        library.clearPlays()
        library.save(songs)
        // The same shape of week as the web capture, with only fixture songs.
        val now = System.currentTimeMillis()
        songs.forEachIndexed { index, song ->
            repeat(4 - index / 3) { play ->
                val at = now - ((index * 5 + play * 3) % 6) * 86_400_000L - play * 3_600_000L
                library.addPlay(Play(song.id, at, 120 + index * 10, play % 2 == 0))
            }
        }

    }

    private fun capture(name: String, opening: Opening, dark: Boolean = true) {
        val output = output() ?: return
        val app = ApplicationProvider.getApplicationContext<WaveApplication>()
        seed(app, output)
        if (opening == Opening.Player) {
            // The screen is real; the files in this JVM fixture contain no audio.
            val songs = Library(app).load()
            app.player.play(songs, songs.first())
        }
        rule.setContent { WaveTheme(dark = dark) { WaveApp(version = "0.1.1", opening = opening) } }
        rule.waitForIdle()
        val view = rule.activity.window.decorView
        val width = if (view.width > 0) view.width else 822
        val height = if (view.height > 0) view.height else 1782
        if (view.width == 0) {
            view.measure(
                android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY),
            )
            view.layout(0, 0, width, height)
        }
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        FileOutputStream(File(output, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
