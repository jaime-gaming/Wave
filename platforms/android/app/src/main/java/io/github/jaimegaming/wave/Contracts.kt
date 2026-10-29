package io.github.jaimegaming.wave
import kotlin.math.cos
import kotlin.math.sin
import java.text.Normalizer

data class LyricLine(val time: Double, val text: String)
fun parseLrc(raw: String): List<LyricLine> {
    val offset = Regex("\\[offset:([+-]?\\d+)\\]").find(raw)?.groupValues?.get(1)?.toDoubleOrNull()?.div(1000) ?: 0.0
    val regex = Regex("\\[(\\d{1,4}):([0-5]\\d)(?:[.:](\\d{1,3}))?\\]")
    return raw.take(100000).lineSequence().flatMap { row -> val text=regex.replace(row,"").trim(); regex.findAll(row).map { m -> LyricLine((m.groupValues[1].toDouble()*60+m.groupValues[2].toDouble()+("0."+m.groupValues[3].ifEmpty { "0" }).toDouble()-offset).coerceAtLeast(0.0),text) } }.take(2000).sortedBy { it.time }.toList()
}
/** The bar shows tenths of a second, so a position is published when it moves one. */
// A tenth of a second, minus a hair: 10.1 - 10.0 is 0.09999999999999964 in
// binary floating point, and the bar still has to move at ten past ten.
fun shouldPublishTime(last: Double, next: Double, fading: Boolean) =
    fading || kotlin.math.abs(next - last) >= .1 - 1e-9
fun powerGains(progress: Double): Pair<Float,Float> { val angle=progress.coerceIn(0.0,1.0)*Math.PI/2; return cos(angle).toFloat() to sin(angle).toFloat() }
/** A blend long enough to be a mix: an arrival, a passage together and a departure. */
const val BLEND_SECONDS = 16.0
/** Smooth 0..1 ramp; the handover uses it so no level ever steps. */
fun smoothstep(value: Double): Double { val t=value.coerceIn(0.0,1.0);return t*t*(3-2*t) }
/**
 * Staged handover, kept in step with the web build: the incoming song is at level
 * by a quarter of the blend and holds, the outgoing song only leaves in the second
 * half. Constant power throughout, so the join never dips.
 */
fun handoverGains(progress: Double): Pair<Float,Float> {
    val p=progress.coerceIn(0.0,1.0)
    val phase=when { p<.28 -> .5*smoothstep(p/.28); p<.62 -> .5+.06*smoothstep((p-.28)/.34); else -> .56+.44*smoothstep((p-.62)/.38) }
    val angle=phase*Math.PI/2
    return cos(angle).toFloat() to sin(angle).toFloat()
}
fun canonical(value:String) = Normalizer.normalize(value,Normalizer.Form.NFKD).replace(Regex("\\p{M}"),"").lowercase().replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()

/**
 * Searching the library, ranked the way a person means it.
 *
 * The order answers "what did you type" before "what contains what": the exact
 * title first, then titles that start with the words, then a word inside a title,
 * then names that merely contain the letters, and only then the artist, the album
 * and the file name. `null` means no match at all.
 */
fun searchRank(song: Song, query: String): Int? {
    val needle = canonical(query)
    if (needle.isEmpty()) return 0
    val title = canonical(song.title)
    val artist = canonical(song.artist)
    val album = canonical(song.album)
    val file = canonical(song.filename.substringBeforeLast('.'))
    return when {
        title == needle -> 0
        title.startsWith("$needle ") -> 1
        title.split(' ').any { it.startsWith(needle) } -> 2
        title.contains(needle) -> 3
        artist == needle -> 4
        artist.startsWith(needle) -> 5
        artist.contains(needle) -> 5
        album.contains(needle) -> 6
        file.contains(needle) -> 7
        else -> null
    }
}

/** Every song that matches, closest first; the tie is broken by title. */
fun rankSongs(songs: List<Song>, query: String): List<Song> {
    if (canonical(query).isEmpty()) return songs
    return songs
        .mapNotNull { song -> searchRank(song, query)?.let { song to it } }
        .sortedWith(compareBy({ it.second }, { canonical(it.first.title) }))
        .map { it.first }
}

/** A mix of one kind of music, rebuilt each morning from the tags in the files. */
data class DailyMix(val label: String, val songs: List<Song>)

/**
 * Up to three mixes, one per tag, each at least three songs long.
 *
 * Nothing is generated and nothing is random: the songs are the listener's own,
 * grouped by the genre tag they already carry, and the order rotates with the
 * date so today's mix is not yesterday's mix. Within one day it never moves, so
 * a mix behaves like a playlist rather than a shuffle.
 */
fun dailyMixes(songs: List<Song>, day: String, limit: Int = 30): List<DailyMix> {
    val seed = day.fold(7) { acc, c -> (acc * 31 + c.code) and 0x7FFFFFFF }
    return songs
        .filter { it.genre.isNotBlank() }
        .groupBy { it.genre.trim() }
        .filterValues { it.size >= 3 }
        .map { (genre, group) ->
            val rotation = if (group.isEmpty()) 0 else seed % group.size
            val ordered = group.drop(rotation) + group.take(rotation)
            DailyMix(genre, ordered.take(limit))
        }
        .sortedWith(compareByDescending<DailyMix> { it.songs.size }.thenBy { it.label.lowercase() })
        .take(3)
}

/** One listen, as it was heard. */
data class Play(
    val songId: String,
    val at: Long,
    val seconds: Int,
    val completed: Boolean,
)

/** Seconds after which a listen is counted as a play. */
const val PLAY_THRESHOLD_SECONDS = 30

/** Half the song, at most thirty seconds, and never less than five. */
fun playThreshold(duration: Double): Int =
    if (!duration.isFinite() || duration <= 0) PLAY_THRESHOLD_SECONDS
    else maxOf(5, minOf(PLAY_THRESHOLD_SECONDS, (duration / 2).toInt()))

fun countsAsPlay(seconds: Int, duration: Double): Boolean = seconds >= playThreshold(duration)

/**
 * What the listening page shows.
 *
 * A deleted song keeps its seconds in the total — the time was still spent — but
 * every list is built from the songs that are still here, so nothing dangles.
 */
data class ListeningSummary(
    val totalSeconds: Int,
    val weekSeconds: Int,
    val weekPlays: Int,
    val uniqueSongs: Int,
    val topSongs: List<Pair<Song, Int>>,
    val topArtists: List<Pair<String, Int>>,
    val recent: List<Song>,
)

private const val WEEK = 7L * 24 * 60 * 60 * 1000

fun listeningSummary(plays: List<Play>, songs: List<Song>, now: Long): ListeningSummary {
    val byId = songs.associateBy { it.id }
    val live = plays.filter { byId.containsKey(it.songId) }
    val week = plays.filter { now - it.at in 0..WEEK }
    val weekLive = week.filter { byId.containsKey(it.songId) }
    val countBySong = live.groupingBy { it.songId }.eachCount()
    val topSongs = countBySong.entries
        .mapNotNull { entry -> byId[entry.key]?.let { it to entry.value } }
        .sortedWith(compareByDescending<Pair<Song, Int>> { it.second }.thenBy { canonical(it.first.title) })
        .take(5)
    val topArtists = live
        .mapNotNull { play -> byId[play.songId]?.artist?.ifBlank { "Unknown artist" } }
        .groupingBy { it }
        .eachCount()
        .entries
        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key.lowercase() })
        .take(5)
        .map { it.key to it.value }
    val recent = live
        .sortedByDescending { it.at }
        .mapNotNull { byId[it.songId] }
        .distinctBy { it.id }
        .take(20)
    return ListeningSummary(
        totalSeconds = plays.sumOf { it.seconds },
        weekSeconds = weekLive.sumOf { it.seconds },
        weekPlays = weekLive.size,
        uniqueSongs = countBySong.size,
        topSongs = topSongs,
        topArtists = topArtists,
        recent = recent,
    )
}

/** Time in words: "3 min" reads better than "0:03:00" on a listening page. */
/**
 * "1 song", "12 songs": a count and its word, singular when it should be.
 *
 * A summary reading "1 albums" is the kind of small wrongness that makes an app
 * look unfinished, and there are enough counts in the interface to be worth one
 * helper for all of them.
 */
fun count(value: Int, singular: String, plural: String = singular + "s"): String =
    "$value ${if (value == 1) singular else plural}"

/** The listening page's headline number, in words. */
    if (seconds < 60) return "less than a minute"
    val minutes = seconds / 60
    if (minutes < 60) return "$minutes min"
    val hours = minutes / 60
    val rest = minutes % 60
    return if (rest == 0) "$hours h" else "$hours h $rest min"
}

/** A position or a length, as a clock reads it. */
fun formatTime(seconds: Double): String {
    if (!seconds.isFinite() || seconds <= 0) return "0:00"
    val total = seconds.toInt()
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val rest = total % 60
    val tail = "$minutes:${rest.toString().padStart(2, '0')}"
    return if (hours > 0) "$hours:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}" else tail
}

/**
 * The week as one card, and the list it earns.
 *
 * The window is the last seven local days, today included, and the comparison is
 * the seven before it. A recap is only about a real week: nothing here is a taste
 * profile or a guess at what to play next, it is what this device saw being heard.
 * "Remix" is the week's songs, most played first, topped up from the all-time
 * list when a week is thin, with no repeats.
 */
data class WeekRecap(
    val start: Long,
    val end: Long,
    val seconds: Int,
    val plays: Int,
    val tracks: Int,
    val artists: Int,
    val previousSeconds: Int,
    val topSongs: List<Pair<Song, Int>>,
    val topArtists: List<Pair<String, Int>>,
    val songs: List<Song>,
)

/** How long a Remix list is. */
const val REMIX_LENGTH = 12

private fun startOfDay(at: Long): Long {
    val calendar = java.util.Calendar.getInstance()
    calendar.timeInMillis = at
    calendar.set(java.util.Calendar.HOUR_OF_DAY, 0)
    calendar.set(java.util.Calendar.MINUTE, 0)
    calendar.set(java.util.Calendar.SECOND, 0)
    calendar.set(java.util.Calendar.MILLISECOND, 0)
    return calendar.timeInMillis
}

fun weekRecap(plays: List<Play>, songs: List<Song>, now: Long): WeekRecap {
    val byId = songs.associateBy { it.id }
    val end = startOfDay(now)
    val start = end - 6 * 24 * 60 * 60 * 1000L
    val previousStart = start - 7 * 24 * 60 * 60 * 1000L
    val week = plays.filter { it.at in start..Long.MAX_VALUE }
    val previous = plays.filter { it.at in previousStart until start }

    val counts = mutableMapOf<String, Int>()
    val artists = mutableMapOf<String, Int>()
    for (play in week) {
        val song = byId[play.songId] ?: continue
        counts[song.id] = (counts[song.id] ?: 0) + 1
        val name = song.artist.ifBlank { "Unknown artist" }
        artists[name] = (artists[name] ?: 0) + 1
    }
    val top = counts.entries
        .mapNotNull { entry -> byId[entry.key]?.let { it to entry.value } }
        .sortedWith(compareByDescending<Pair<Song, Int>> { it.second }.thenBy { canonical(it.first.title) })
    val mix = top.map { it.first }.toMutableList()
    if (mix.size < REMIX_LENGTH) {
        val seen = mix.map { it.id }.toMutableSet()
        val allTime = listeningSummary(plays, songs, now).topSongs
        for ((song, _) in allTime) {
            if (mix.size >= REMIX_LENGTH) break
            if (song.id in seen) continue
            seen.add(song.id)
            mix.add(song)
        }
    }
    return WeekRecap(
        start = start,
        end = end,
        seconds = week.sumOf { play -> byId[play.songId]?.let { play.seconds } ?: 0 },
        plays = week.size,
        tracks = counts.size,
        artists = artists.size,
        previousSeconds = previous.sumOf { it.seconds },
        topSongs = top.take(8),
        topArtists = artists.entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key.lowercase() })
            .take(3)
            .map { it.key to it.value },
        songs = mix.take(REMIX_LENGTH),
    )
}

/** "23 – 29 Oct", or "28 Oct – 3 Nov" when the week crosses a month. */
fun weekRange(start: Long, end: Long): String {
    val locale = java.util.Locale.US
    val first = java.util.Calendar.getInstance().apply { timeInMillis = start }
    val last = java.util.Calendar.getInstance().apply { timeInMillis = end }
    val month = java.text.SimpleDateFormat("MMM", locale)
    return if (first.get(java.util.Calendar.MONTH) == last.get(java.util.Calendar.MONTH)) {
        "${first.get(java.util.Calendar.DAY_OF_MONTH)} – ${last.get(java.util.Calendar.DAY_OF_MONTH)} ${month.format(last.time)}"
    } else {
        "${first.get(java.util.Calendar.DAY_OF_MONTH)} ${month.format(first.time)} – " +
            "${last.get(java.util.Calendar.DAY_OF_MONTH)} ${month.format(last.time)}"
    }
}
