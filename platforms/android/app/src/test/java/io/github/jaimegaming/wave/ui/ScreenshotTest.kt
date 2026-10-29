package io.github.jaimegaming.wave.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
 * a coloured tile with the song's initial — because that is what these files
 * are. Nothing here is a mock-up and nothing is retouched.
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
    fun remix() = capture("android-remix", Opening.Where(Destination.Remix))

    @Test
    fun library() = capture("android-library", Opening.Where(Destination.Library))

    private fun output(): File? {
        val flag = System.getProperty("wave.screenshots").orEmpty()
        assumeTrue("Pass -Dwave.screenshots=<directory> to capture.", flag.isNotEmpty())
        return File(flag).apply { mkdirs() }
    }

    /** A small library and a week of plays, written through the app's own files. */
    private fun seed(app: WaveApplication, output: File) {
        val library = Library(app)
        // The same demo library the web captures use: three artists, an album each.
        val songs = listOf(
            Triple("Night signals", "Northbound", "Northbound"),
            Triple("Soft light", "Sunday Club", "Sunday Club"),
            Triple("In the distance", "The Coastline", "The Coastline"),
            Triple("Long way home", "Northbound", "Northbound"),
            Triple("Late set", "Sunday Club", "Sunday Club"),
            Triple("Salt air", "The Coastline", "The Coastline"),
        ).mapIndexed { index, (title, artist, album) ->
            Song(
                id = "demo-$index",
                title = title,
                artist = artist,
                album = album,
                filename = "$title.wav",
                path = File(output, "demo-$index.wav").absolutePath,
                duration = 180.0,
                genre = if (index % 3 == 0) "Electronic" else if (index % 3 == 1) "Jazz" else "Rock",
                addedAt = System.currentTimeMillis() - index * 86_400_000L,
            )
        }
        library.save(songs)
        // Two songs heard most, then the rest, on days inside the week.
        val now = System.currentTimeMillis()
        for (round in 0 until 9) {
            val song = songs[round % 3]
            library.addPlay(Play(song.id, now - round * 3_600_000L, 120 + round * 10, true))
        }
        library.addPlay(Play(songs[0].id, now - 8L * 86_400_000L, 200, true))
    }

    private fun capture(name: String, opening: Opening) {
        val output = output() ?: return
        seed(ApplicationProvider.getApplicationContext<WaveApplication>(), output)
        rule.setContent { WaveTheme { WaveApp(version = "0.1.1", opening = opening) } }
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
