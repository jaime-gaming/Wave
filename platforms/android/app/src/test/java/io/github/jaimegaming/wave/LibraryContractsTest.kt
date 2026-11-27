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
    fun aQueryMatchesTheStartsOfWordsInAnyOrder() {
        assertEquals(2, searchRank(song("1", title = "Midnight City"), "city mid"))

        assertTrue(searchRank(song("1", title = "Midnight"), "night")!! > searchRank(song("2", title = "Night signals"), "night")!!)
    }

    @Test
    fun aQueryWithALetterInTheWrongPlaceStillFindsTheSong() {
        val nightcall = song("1", title = "Nightcall")
        assertEquals(7, searchRank(nightcall, "nightclal"))

        assertTrue(searchRank(nightcall, "night")!! < searchRank(nightcall, "nightclal")!!)
        assertNull(searchRank(nightcall, "zzzz"))
        assertEquals(listOf("Midnight City"), rankNames(listOf("Nightcall", "Midnight City"), "midnigth"))
    }

    @Test
    fun namesAreRankedTheNameTypedFirst() {
        val names = listOf("Nightcall (Deluxe)", "Midnight City", "Nightcall", "Nights")
        assertEquals(listOf("Nights", "Nightcall", "Nightcall (Deluxe)", "Midnight City"), rankNames(names, "night"))
        assertEquals(names, rankNames(names, "  "))
        assertEquals(emptyList<String>(), rankNames(names, "zzz"))
    }

    @Test
    fun searchIgnoresAccentsAndCase() {
        assertEquals(0, searchRank(song("1", title = "Beyoncé"), "BEYONCE"))
        assertEquals(0, searchRank(song("1", title = "Café del mar"), "cafe del mar"))
    }

    @Test
    fun dailyMixesRequireSevenTracksCapAtThreeAndLockCoversForTheDay() {
        val songs = (1..8).map { song("e$it", genre = "Electronic", artist = "Artist ${it % 4}", album = "Alb $it") } +
            (1..7).map { song("j$it", genre = "Jazz", artist = "Jazz ${it % 4}", album = "JAlb $it") } +
            (1..6).map { song("r$it", genre = "Rock", artist = "Rock ${it % 3}", album = "RAlb $it") }
        val mixes = dailyMixes(songs, "2026-10-29")
        assertEquals(setOf("Electronic", "Jazz"), mixes.map { it.label }.toSet())
        assertTrue(mixes.size <= MAX_DAILY_MIXES)
        assertTrue(mixes.all { it.songs.size in MIN_DAILY_MIX_TRACKS..MAX_DAILY_MIX_TRACKS })
        assertTrue(mixes.all { it.covers.isNotEmpty() && it.covers.size <= 3 })
        val again = dailyMixes(songs, "2026-10-29")
        assertEquals(mixes[0].covers.map { it.id }, again[0].covers.map { it.id })
    }

    @Test
    fun aMixRotatesWithTheDayAndStaysPutWithinIt() {
        val songs = (1..10).map { song("$it", genre = "Electronic", artist = "Artist ${it % 5}") }
        val monday = dailyMixes(songs, "2026-10-27")[0].songs.map { it.id }
        val again = dailyMixes(songs, "2026-10-27")[0].songs.map { it.id }
        val tuesday = dailyMixes(songs, "2026-10-28")[0].songs.map { it.id }
        assertEquals(monday, again)
        assertEquals(monday.toSet(), tuesday.toSet())
        assertTrue("the first song changes overnight", monday != tuesday)
    }

    @Test
    fun localMoodEngineDetectsMoodAndGuidesAutoplay() {
        val chill = song("c1", title = "Lluvia Suave", genre = "Ambient", artist = "A1")
        val chill2 = song("c2", title = "Calma de Noche", genre = "Lo-Fi", artist = "A2")
        val intense = song("h1", title = "Tormenta de Fuego", genre = "Metal", artist = "A3")
        val now = 1_800_000_000_000L
        val session = inferListeningMood(
            listOf(chill, chill2, intense),
            listOf(
                MoodSignal("c1", 210, 210.0, true, now - 10_000),
                MoodSignal("h1", 5, 210.0, false, now - 2_000),
            ),
            chill,
            now,
        )
        assertTrue(session.energy < 0.45)
        val picked = pickAutoplayNext(listOf(chill, chill2, intense), chill, emptyList(), listOf(MoodSignal("c1", 210, 210.0, true, now - 5_000)), draw = 0.05)
        assertEquals("c2", picked?.id)
    }

    @Test
    fun autoplayRecyclesOlderSongsWhenEverySongHasBeenHeard() {
        val songs = (0 until 6).map { song("s$it", artist = "Artist $it") }
        val pick = pickAutoplayNext(songs, songs.last(), songs.map { it.id }, emptyList(), draw = 0.0)
        assertEquals("s0", pick?.id)
    }

    @Test
    fun monthlyAndYearlyRecapsAggregateFullHistory() {
        val a = song("a", artist = "One", genre = "Indie")
        val now = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.OCTOBER, 29, 20, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        val plays = listOf(Play("a", now - 3_600_000L, 180, true))
        val month = monthlyRecap(plays, listOf(a), now)
        val year = yearlyRecap(plays, listOf(a), now)
        assertEquals(180, month.seconds)
        assertEquals(180, year.seconds)
        assertEquals("2026", yearRange(year.start))
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

        assertEquals(270, summary.totalSeconds)
        assertEquals(3, summary.weekPlays)
        assertEquals("a", summary.topSongs.first().first.id)


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

        assertEquals(300, recap.previousSeconds)
        assertEquals("a", recap.songs.first().id)
        assertEquals(2, recap.topSongs.first().second)
        assertEquals("23 – 29 Oct", weekRange(recap.start, recap.end))
    }

    @Test
    fun theWeekIsAlsoSevenBarsAnHourStripAndSomeGenres() {
        val a = song("a", artist = "One", genre = "Ambient")
        val b = song("b", artist = "Two", genre = "Jazz")
        val c = song("c", artist = "Two")
        val now = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.OCTOBER, 29, 20, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        fun daysAgo(days: Int, hours: Int) = java.util.Calendar.getInstance().apply {
            timeInMillis = now
            add(java.util.Calendar.DAY_OF_YEAR, -days)
            set(java.util.Calendar.HOUR_OF_DAY, hours)
        }.timeInMillis
        val recap = weekRecap(
            listOf(
                Play("a", daysAgo(1, 21), 100, true),
                Play("b", daysAgo(2, 9), 60, true),
                Play("c", daysAgo(0, 9), 200, true),
            ),
            listOf(a, b, c),
            now,
        )


        assertEquals(7, recap.days.size)
        assertEquals(recap.seconds, recap.days.sumOf { it.seconds })
        assertEquals(recap.plays, recap.days.sumOf { it.plays })

        assertEquals(24, recap.hours.size)
        assertEquals(recap.plays, recap.hours.sumOf { it })
        assertEquals("Ambient", recap.genres.first().genre)
        assertEquals(100, recap.genres.first().seconds)

        assertEquals(160, recap.genres.sumOf { it.seconds })
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

    @Test
    fun fourWeeksAreKeptAndEachOneIsItsOwnWindow() {
        val a = song("a", artist = "One")
        val now = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.OCTOBER, 29, 20, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        val day = 24L * 60 * 60 * 1000
        val plays = listOf(
            Play("a", now - day, 100, true),
            Play("a", now - 8 * day, 200, true),
            Play("a", now - 15 * day, 300, true),
            Play("a", now - 22 * day, 400, true),
            Play("a", now - 40 * day, 500, true),
        )
        val weeks = weeklyRecaps(plays, listOf(a), now)
        assertEquals(4, weeks.size)

        assertEquals(listOf(100, 200, 300, 400), weeks.map { it.seconds })

        assertEquals(200, weeks[0].previousSeconds)
        assertEquals(1, weeks[0].plays)
    }
    @Test
    fun dailyMixesRespectTheThreeByTwentyLimitEvenWithAnOversizedRequest() {
        val songs = (0 until 5).flatMap { genre -> (0 until 35).map { index -> song("mix-$genre-$index", genre = "Style $genre") } }
        val mixes = dailyMixes(songs, "2026-11-06", limit = 100)
        assertEquals(3, mixes.size)
        assertTrue(mixes.all { it.songs.size in 14..20 })
    }
}
