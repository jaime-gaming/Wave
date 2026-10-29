package io.github.jaimegaming.wave

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LibraryContractsTest {
    private fun song(
        id: String,
        title: String = "Song $id",
        artist: String = "Artist",
        album: String = "Album",
        genre: String = "",
        duration: Double = 200.0,
    ) = Song(id, title, artist, album, "$title.mp3", "/tmp/$id.mp3", duration, genre = genre)

    @Test
    fun searchPrefersTheSongYouMeant() {
        val exact = song("1", title = "Night")
        val prefix = song("2", title = "Night signals")
        val word = song("3", title = "Open night skies")
        val inside = song("4", title = "Midnight")
        val byArtist = song("5", title = "Something else", artist = "Night")
        val ranked = rankSongs(listOf(byArtist, inside, word, prefix, exact), "night")
        assertEquals(listOf("1", "2", "3", "4", "5"), ranked.map { it.id })
        assertNull(searchRank(song("6", title = "Daylight"), "night"))
    }

    @Test
    fun searchIgnoresAccentsAndCase() {
        assertEquals(0, searchRank(song("1", title = "Beyoncé"), "BEYONCE"))
        assertEquals(0, searchRank(song("1", title = "Café del mar"), "cafe del mar"))
    }

    @Test
    fun dailyMixesGroupByTagAndSkipThinGroups() {
        val songs = listOf(
            song("1", genre = "Electronic"),
            song("2", genre = "Electronic"),
            song("3", genre = "Electronic"),
            song("4", genre = "Jazz"),
            song("5", genre = "Jazz"),
            song("6", genre = "Jazz"),
            song("7", genre = "Rock"),
            song("8", genre = "Rock"),
        )
        val mixes = dailyMixes(songs, "2026-10-29")
        assertEquals(setOf("Electronic", "Jazz"), mixes.map { it.label }.toSet())
        assertTrue(mixes.all { it.songs.size >= 3 })
    }

    @Test
    fun aMixRotatesWithTheDayAndStaysPutWithinIt() {
        val songs = (1..5).map { song("$it", genre = "Electronic") }
        val monday = dailyMixes(songs, "2026-10-27")[0].songs.map { it.id }
        val again = dailyMixes(songs, "2026-10-27")[0].songs.map { it.id }
        val tuesday = dailyMixes(songs, "2026-10-28")[0].songs.map { it.id }
        assertEquals(monday, again)
        assertEquals(monday.toSet(), tuesday.toSet())
        assertTrue("the first song changes overnight", monday != tuesday)
    }

    @Test
    fun aPlayNeedsHalfTheSongOrThirtySeconds() {
        assertEquals(30, playThreshold(240.0))
        assertEquals(20, playThreshold(40.0))
        assertEquals(5, playThreshold(3.0))
        assertTrue(countsAsPlay(30, 240.0))
        assertTrue(!countsAsPlay(29, 240.0))
        assertTrue(!countsAsPlay(10, 40.0))
    }

    @Test
    fun theSummaryCountsWhatWasListenedAndSkipsDeletedSongs() {
        val a = song("a", artist = "One")
        val b = song("b", artist = "Two")
        val now = 1_800_000_000_000L
        val plays = listOf(
            Play("a", now - 2_000, 40, true),
            Play("a", now - 1_000, 50, true),
            Play("b", now - 500, 60, true),
            Play("gone", now - 400, 90, false),
            Play("a", now - 30L * 24 * 60 * 60 * 1000, 30, false),
        )
        val summary = listeningSummary(plays, listOf(a, b), now)
        // A deleted song keeps its seconds but never appears in a list.
        assertEquals(270, summary.totalSeconds)
        assertEquals(3, summary.weekPlays)
        assertEquals("a", summary.topSongs.first().first.id)
        // Most played counts every play, including the one twenty days ago; only
        // the week figures are bounded by the week.
        assertEquals(3, summary.topSongs.first().second)
        assertEquals(listOf("One", "Two"), summary.topArtists.map { it.first })
        assertEquals(listOf("b", "a"), summary.recent.take(2).map { it.id })
        assertEquals(2, summary.uniqueSongs)
    }

    @Test
    fun listeningTimeReadsAsWords() {
        assertEquals("less than a minute", listeningTime(20))
        assertEquals("2 min", listeningTime(120))
        assertEquals("1 h", listeningTime(3600))
        assertEquals("1 h 30 min", listeningTime(5400))
    }

    @Test
    fun durationsAreShortAndReadable() {
        assertEquals("3:20", formatTime(200.0))
        assertEquals("1:00:05", formatTime(3605.0))
        assertEquals("0:00", formatTime(Double.NaN))
    }

    @Test
    fun theWeekCountsSevenDaysAndComparesWithTheOneBefore() {
        val a = song("a", artist = "One")
        val b = song("b", artist = "Two")
        val now = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.OCTOBER, 29, 20, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        fun daysAgo(days: Int, hours: Int = 9) = java.util.Calendar.getInstance().apply {
            timeInMillis = now
            add(java.util.Calendar.DAY_OF_YEAR, -days)
            set(java.util.Calendar.HOUR_OF_DAY, hours)
        }.timeInMillis
        val plays = listOf(
            Play("a", daysAgo(1), 200, true),
            Play("a", daysAgo(2), 200, true),
            Play("b", daysAgo(0), 120, true),
            Play("b", daysAgo(9), 300, true),
        )
        val recap = weekRecap(plays, listOf(a, b), now)
        assertEquals(520, recap.seconds)
        assertEquals(3, recap.plays)
        assertEquals(2, recap.tracks)
        assertEquals(2, recap.artists)
        // The nine-day-old play is the comparison, not the week.
        assertEquals(300, recap.previousSeconds)
        assertEquals("a", recap.songs.first().id)
        assertEquals(2, recap.topSongs.first().second)
        assertEquals("23 – 29 Oct", weekRange(recap.start, recap.end))
    }

    @Test
    fun aThinWeekIsToppedUpWithoutRepeatingASong() {
        val library = (1..6).map { song("$it", title = "Song $it") }
        val now = 1_800_000_000_000L
        val plays = listOf(
            Play("1", now - 60_000, 120, true),
            Play("2", now - 20L * 24 * 60 * 60 * 1000, 120, true),
            Play("3", now - 21L * 24 * 60 * 60 * 1000, 120, true),
            Play("4", now - 22L * 24 * 60 * 60 * 1000, 120, true),
        )
        val recap = weekRecap(plays, library, now)
        assertEquals("1", recap.songs.first().id)
        assertEquals(recap.songs.size, recap.songs.map { it.id }.distinct().size)
        assertTrue("the week's song still leads", recap.songs.size >= 4)
    }
}
