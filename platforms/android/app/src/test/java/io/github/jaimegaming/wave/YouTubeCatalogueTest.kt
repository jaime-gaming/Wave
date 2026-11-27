package io.github.jaimegaming.wave

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class YouTubeCatalogueTest {
    @Test fun onlyAcceptsYouTubeVideoLinks() {
        val id = "dQw4w9WgXcQ"
        listOf("https://youtu.be/$id", "https://www.youtube.com/watch?v=$id&t=30", "https://m.youtube.com/shorts/$id")
            .forEach { assertEquals(id, YouTubeCatalogue.videoIdFromLink(it)) }
        listOf("https://youtube.com.evil.test/watch?v=$id", "https://user@youtube.com/watch?v=$id", "https://youtu.be/invalid", "https://youtube.com/playlist?list=abc", "javascript://youtube.com/watch?v=$id")
            .forEach { assertNull(YouTubeCatalogue.videoIdFromLink(it)) }
    }
}
