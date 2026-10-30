package io.github.jaimegaming.wave.ui

import android.graphics.Bitmap
import android.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ArtworkPaletteTest {
    @Test
    fun samplesArtworkWithoutChangingIt() {
        val bitmap = Bitmap.createBitmap(12, 12, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.RED)
        assertEquals(0f, artworkHue(bitmap), 0.1f)
        assertEquals(Color.RED, bitmap.getPixel(0, 0))
        bitmap.eraseColor(Color.GREEN)
        assertEquals(120f, artworkHue(bitmap), 0.1f)
        bitmap.eraseColor(Color.GRAY)
        assertEquals(220f, artworkHue(bitmap), 0.1f)
        assertEquals(226f, artworkHue(null), 0.1f)
        bitmap.recycle()
    }
}
