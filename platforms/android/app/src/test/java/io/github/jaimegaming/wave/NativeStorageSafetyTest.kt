package io.github.jaimegaming.wave

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** Removal may forget a library row, but must never delete someone else's file. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativeStorageSafetyTest {
    private fun song(id: String, path: String) =
        Song(id, "Song $id", "Artist", "Album", "$id.wav", path)

    @Test
    fun removingAnExternalPathPreservesTheOriginal() {
        val app = ApplicationProvider.getApplicationContext<WaveApplication>()
        val library = Library(app)
        val original = File.createTempFile("wave-original-", ".wav", app.cacheDir)
        try {
            library.save(listOf(song("external", original.absolutePath)))
            library.delete("external")
            assertTrue("The original is outside Wave's audio directory", original.exists())
            assertTrue(library.load().isEmpty())
        } finally {
            original.delete() // only this test's temporary file
        }
    }

    @Test
    fun aSharedCopyRemainsUntilItsLastReferenceIsRemoved() {
        val app = ApplicationProvider.getApplicationContext<WaveApplication>()
        val library = Library(app)
        val directory = File(app.filesDir, "audio").apply { mkdirs() }
        val copy = File.createTempFile("wave-copy-", ".wav", directory)
        try {
            library.save(listOf(song("one", copy.absolutePath), song("two", copy.absolutePath)))
            library.delete("one")
            assertTrue("Another song still points at the copied file", copy.exists())
            library.delete("two")
            assertFalse(copy.exists())
        } finally {
            copy.delete() // only this test's temporary file
        }
    }
}
