package io.github.jaimegaming.wave
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import java.text.Normalizer

data class LyricWord(val time: Double, val text: String, val end: Double? = null)
data class LyricLine(val time: Double, val text: String, val words: List<LyricWord> = emptyList())

/** Enhanced LRC keeps real word timestamps; ordinary LRC stays line-synchronised. */
fun parseLrc(raw: String): List<LyricLine> {
    val offset = Regex("\\[offset:\\s*([+-]?\\d+)\\s*\\]", RegexOption.IGNORE_CASE)
        .find(raw)?.groupValues?.get(1)?.toDoubleOrNull()?.div(1000) ?: 0.0
    val stamp = Regex("\\[(\\d{1,4}):([0-5]?\\d)(?:[.,:](\\d{1,3}))?\\]")
    val wordStamp = Regex("<(\\d{1,4}):([0-5]?\\d)(?:[.,:](\\d{1,3}))?>")
    fun time(match: MatchResult): Double = match.groupValues[1].toDouble() * 60 +
        match.groupValues[2].toDouble() + ("0." + match.groupValues[3].ifEmpty { "0" }).toDouble()

    return raw.take(100000).lineSequence().flatMap { row ->
        val stamps = stamp.findAll(row).toList()
        if (stamps.isEmpty()) return@flatMap emptySequence()
        val content = stamp.replace(row, "")
        val markers = wordStamp.findAll(content).toList()
        val text = wordStamp.replace(content, "").trim()
        val first = time(stamps.first())
        val pieces = mutableListOf<LyricWord>()
        if (markers.isNotEmpty()) {
            val prefix = content.substring(0, markers.first().range.first).trimStart()
            if (prefix.isNotEmpty()) pieces.add(LyricWord(first, prefix, time(markers.first())))
            markers.forEachIndexed { index, marker ->
                val next = markers.getOrNull(index + 1)
                val part = content.substring(marker.range.last + 1, next?.range?.first ?: content.length)
                if (part.isNotEmpty()) pieces.add(LyricWord(time(marker), part, next?.let(::time)))
            }
            if (pieces.isNotEmpty()) pieces[pieces.lastIndex] = pieces.last().copy(text = pieces.last().text.trimEnd())
        }
        val valid = pieces.isNotEmpty() && pieces.withIndex().all { (index, word) ->
            word.time >= first && (index == 0 || word.time >= pieces[index - 1].time) &&
                (word.end == null || word.end >= word.time)
        }
        stamps.asSequence().map { marker ->
            val lineTime = time(marker)
            val words = if (valid) pieces.map { word ->
                LyricWord(
                    (word.time + lineTime - first - offset).coerceAtLeast(0.0),
                    word.text,
                    word.end?.let { (it + lineTime - first - offset).coerceAtLeast(0.0) },
                )
            } else emptyList()
            LyricLine((lineTime - offset).coerceAtLeast(0.0), text, words)
        }
    }.take(2000).sortedBy { it.time }.toList()
}
/** The bar shows tenths of a second, so a position is published when it moves one. */
// A tenth of a second, minus a hair: 10.1 - 10.0 is 0.09999999999999964 in
// binary floating point, and the bar still has to move at ten past ten.
fun shouldPublishTime(last: Double, next: Double, fading: Boolean) =
    fading || kotlin.math.abs(next - last) >= .1 - 1e-9
/** A blend long enough to be a mix: an arrival, a passage together and a departure. */
const val BLEND_SECONDS = 24.0
/** The shortest a blend gets on material that is long enough to have one. */
const val MIX_FLOOR_SECONDS = 12.0
/**
 * How long two songs overlap, in seconds.
 *
 * The same rule the web client uses: the shorter song gets a fifth of itself, no
 * less than twelve seconds and no more than twenty-four, and never more than half
 * of it. The phone has no beat analysis, so it lines the two up on the seconds
 * rather than on the bar — but the length and the curve are the same ones, which
 * is what makes a mix sound like the same feature on both screens.
 */
fun automaticBlendSeconds(outgoing: Double, incoming: Double): Double {
    if (!outgoing.isFinite() || !incoming.isFinite() || outgoing <= 0 || incoming <= 0) return 0.0
    val shortest = minOf(outgoing, incoming)
    return minOf(BLEND_SECONDS, maxOf(minOf(MIX_FLOOR_SECONDS, shortest / 4), shortest * 0.12), shortest / 2)
}
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

/**
 * The two ways an outgoing song can end on the phone. The shape is detected
 * from local duration and LRC timings: a voice still near the end has no long
 * recorded fade, while a long instrumental outro does. No extra audio decode,
 * polling loop or cloud lookup is added.
 */
enum class EndingShape { FADE, ECHO_CUT }
const val ECHO_CUT_FRACTION = 0.75

fun detectEnding(song: Song): EndingShape {
    if (!song.duration.isFinite() || song.duration < 8) return EndingShape.FADE
    val lastLyric = parseLrc(song.lyrics).lastOrNull()?.time ?: return EndingShape.FADE
    val bar = song.bpm?.takeIf { it.isFinite() && it in 60.0..200.0 }?.let { 240.0 / it } ?: 2.0
    val shortTail = maxOf(4.0, minOf(8.0, 2.0 * bar))
    return if (song.duration - lastLyric <= shortTail) EndingShape.ECHO_CUT else EndingShape.FADE
}

fun endingCut(shape: EndingShape): Double =
    if (shape == EndingShape.ECHO_CUT) ECHO_CUT_FRACTION else 1.0

/** Fade to zero, or three decaying echo repeats cut at 75 % before zero. */
fun endingGains(progress: Double, shape: EndingShape): Pair<Float,Float> {
    val p = progress.coerceIn(0.0, 1.0)
    val base = handoverGains(p)
    if (shape == EndingShape.FADE) return base
    if (p >= ECHO_CUT_FRACTION) return 0f to 1f
    val atCut = handoverGains(ECHO_CUT_FRACTION)
    val ripple = 1.0 + 0.1 * exp(-3.0 * p) * cos(6.0 * Math.PI * p)
    val outgoing = (base.first.toDouble() * ripple).toFloat().coerceIn(0f, 1f)
    val incoming = (base.second / maxOf(.001f, atCut.second)).coerceIn(0f, 1f)
    return outgoing to incoming
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
/**
 * One letter away: typed too quickly, spelled by ear, or two letters the wrong
 * way round. Never lets noise in, because every word of the query has to land.
 */
private fun oneEditApart(a: String, b: String): Boolean {
    if (a == b) return true
    val longer = if (a.length >= b.length) a else b
    val shorter = if (a.length >= b.length) b else a
    if (longer.length - shorter.length > 1) return false
    var at = 0
    while (at < shorter.length && longer[at] == shorter[at]) at++
    if (longer.length == shorter.length) {
        if (longer.substring(at + 1) == shorter.substring(at + 1)) return true
        return at + 2 <= shorter.length && longer[at] == shorter[at + 1] &&
            longer[at + 1] == shorter[at] && longer.substring(at + 2) == shorter.substring(at + 2)
    }
    return longer.substring(at + 1) == shorter.substring(at)
}

/**
 * Every word of the query accounted for: the text already has it, or it is a word
 * of at least six letters one letter away. The floor keeps the tolerance from
 * swallowing the library — "light" and "night" are one letter apart and have
 * nothing to do with each other.
 */
private fun nearWords(text: String, parts: List<String>): Boolean {
    if (parts.isEmpty()) return false
    val words = text.split(' ').filter { it.isNotEmpty() }
    var forgiven = 0
    for (part in parts) {
        if (words.any { word -> word == part || word.startsWith(part) }) continue
        if (part.length < 6 || words.none { word -> oneEditApart(word, part) }) return false
        forgiven++
    }
    return forgiven > 0
}

fun searchRank(song: Song, query: String): Int? {
    val needle = canonical(query)
    if (needle.isEmpty()) return 0
    val title = canonical(song.title)
    val artist = canonical(song.artist)
    val album = canonical(song.album)
    val file = canonical(song.filename.substringBeforeLast('.'))
    // Every word of the query starting a word of the title is a real answer —
    // "city mid" for Midnight City — while the same letters buried inside a word
    // are not, and rank below who made the song.
    val starts = { text: String -> needle.split(' ').filter { it.isNotEmpty() }.let { parts ->
        parts.isNotEmpty() && parts.all { part -> text.split(' ').any { word -> word.startsWith(part) } }
    } }
    return when {
        title == needle -> 0
        title.startsWith(needle) -> 1
        starts(title) -> 2
        title.contains(needle) -> 3
        artist == needle -> 4
        starts(artist) -> 4
        artist.contains(needle) -> 4
        album == needle -> 5
        starts(album) -> 5
        album.contains(needle) -> 5
        file.contains(needle) -> 6
        // A search that answers with nothing because a letter moved is read as
        // the library not holding the song, so one typo still finds it — under
        // everything that was actually spelled that way.
        else -> if (nearWords("$title $artist $album $file", needle.split(' ').filter { it.isNotEmpty() })) 7 else null
    }
}

/**
 * The same ladder for names that carry no ranking of their own: artists, albums
 * and playlists. The name that was typed comes first, then one that starts with
 * it, then one holding that word, then any that merely contains the letters, and
 * a shorter name wins a tie because Night answers "night" more closely than
 * Nightcall (Deluxe).
 */
fun rankNames(values: List<String>, query: String): List<String> {
    val needle = canonical(query)
    if (needle.isEmpty()) return values
    val parts = needle.split(' ').filter { it.isNotEmpty() }
    return values
        .mapNotNull { value ->
            val text = canonical(value)
            val contained = parts.all { text.contains(it) }
            if (!contained && !nearWords(text, parts)) return@mapNotNull null
            val weight = when {
                !contained -> 5
                text == needle -> 0
                text.startsWith(needle) -> 1
                text.split(' ').any { it.startsWith(needle) } -> 2
                text.contains(needle) -> 3
                else -> 4
            }
            Triple(weight, text.length, value)
        }
        .sortedWith(compareBy({ it.first }, { it.second }, { canonical(it.third) }))
        .map { it.third }
}

/**
 * Whether a name answers to what was typed, the way the site decides it: every
 * word has to be somewhere in the name, in any order, accents and punctuation
 * aside. Used for the collections — artists, albums, playlists — which have no
 * ranking of their own.
 */
fun matchesSearch(value: String, query: String): Boolean {
    val words = canonical(query).split(' ').filter { it.isNotEmpty() }
    if (words.isEmpty()) return true
    val text = canonical(value)
    return words.all { text.contains(it) }
}

/** Every song that matches, closest first; the tie is broken by title. */
fun rankSongs(songs: List<Song>, query: String): List<Song> {
    if (canonical(query).isEmpty()) return songs
    return songs
        .mapNotNull { song -> searchRank(song, query)?.let { song to it } }
        .sortedWith(compareBy({ it.second }, { canonical(it.first.title) }))
        .map { it.first }
}

/** Minimum, maximum tracks per Daily Mix and maximum simultaneous mixes, synced with Web 0.2.2. */
const val MIN_DAILY_MIX_TRACKS = 7
const val MAX_DAILY_MIX_TRACKS = 20
const val MAX_DAILY_MIXES = 3

/** A mix of one kind of music, rebuilt each morning with day-locked cover sleeves. */
data class DailyMix(val label: String, val songs: List<Song>, val covers: List<Song> = songs.take(3))

/** 4-axis local musical mood vector (0..1 per dimension), computed strictly on-device. */
data class MoodVector(val energy: Double, val valence: Double, val intensity: Double, val intimacy: Double)

/** Behavioral dwell / quick-skip sample for live on-device mood detection. */
data class MoodSignal(
    val songId: String,
    val seconds: Int,
    val duration: Double,
    val completed: Boolean,
    val at: Long,
)

private val MOOD_GENRE_PROFILES: List<Pair<List<String>, MoodVector>> = listOf(
    listOf("ambient", "drone", "sleep", "meditation", "soundscape") to MoodVector(0.14, 0.48, 0.12, 0.94),
    listOf("lo-fi", "lofi", "chill", "downtempo", "lounge", "trip-hop") to MoodVector(0.28, 0.52, 0.22, 0.82),
    listOf("classical", "piano", "instrumental", "soundtrack", "orchestral", "neoclassical") to MoodVector(0.30, 0.48, 0.25, 0.86),
    listOf("jazz", "bossa", "acoustic", "folk", "unplugged", "trova") to MoodVector(0.36, 0.54, 0.28, 0.76),
    listOf("ballad", "balada", "bolero", "blues", "sad", "shoegaze", "dream pop", "emo") to MoodVector(0.32, 0.24, 0.32, 0.76),
    listOf("soul", "r&b", "rnb", "flamenco", "tango", "corrido") to MoodVector(0.50, 0.55, 0.45, 0.64),
    listOf("synthwave", "retrowave", "darkwave", "vaporwave", "outrun") to MoodVector(0.68, 0.44, 0.62, 0.62),
    listOf("indie", "alternative", "alt-rock", "post-punk", "britpop") to MoodVector(0.58, 0.48, 0.54, 0.48),
    listOf("pop", "disco", "funk", "k-pop", "dance-pop", "synth-pop") to MoodVector(0.76, 0.80, 0.62, 0.24),
    listOf("reggaeton", "reggaetón", "latin", "salsa", "bachata", "cumbia", "afrobeat", "reggae") to MoodVector(0.78, 0.82, 0.68, 0.22),
    listOf("house", "edm", "electronic", "trance", "club", "phonk") to MoodVector(0.84, 0.66, 0.78, 0.30),
    listOf("techno", "dubstep", "dnb", "drum & bass", "hardstyle", "rave", "hyperpop") to MoodVector(0.92, 0.45, 0.92, 0.35),
    listOf("hip-hop", "rap", "trap", "drill", "urbano") to MoodVector(0.70, 0.48, 0.74, 0.36),
    listOf("rock", "classic rock", "hard rock", "grunge") to MoodVector(0.76, 0.52, 0.78, 0.28),
    listOf("metal", "punk", "hardcore", "metalcore") to MoodVector(0.94, 0.28, 0.96, 0.22),
)

private val MOOD_LEXICAL_CUES: List<Pair<List<String>, MoodVector>> = listOf(
    listOf("night", "midnight", "moon", "neon", "shadow", "dark", "noche", "medianoche", "luna", "madrugada", "oscuro") to MoodVector(-0.06, -0.10, 0.0, 0.22),
    listOf("sad", "tears", "alone", "lonely", "heartbreak", "rain", "goodbye", "triste", "soledad", "dolor", "lluvia", "nostalgia", "desamor") to MoodVector(-0.14, -0.26, -0.10, 0.20),
    listOf("calm", "quiet", "sleep", "dream", "soft", "ocean", "waves", "peace", "sunset", "calma", "suave", "brisa", "mar", "paz", "silencio") to MoodVector(-0.22, 0.08, -0.20, 0.22),
    listOf("dance", "party", "summer", "sunshine", "happy", "smile", "fiesta", "bailar", "verano", "feliz", "alegria", "euforia") to MoodVector(0.20, 0.24, 0.12, -0.18),
    listOf("fire", "run", "power", "electric", "storm", "rush", "fuego", "fuerza", "tormenta", "velocidad", "energia") to MoodVector(0.22, 0.0, 0.22, -0.16),
)

/** 100% on-device mood analysis combining EN/ES genres, title/album cues and duration contour. */
fun analyzeSongMood(song: Song): MoodVector {
    var e = 0.20; var v = 0.20; var i = 0.20; var n = 0.20; var w = 0.40
    val genre = song.genre.trim().lowercase()
    if (genre.isNotEmpty()) {
        val hit = MOOD_GENRE_PROFILES.firstOrNull { (tokens, _) -> tokens.any { genre.contains(it) } }
        if (hit != null) {
            e += hit.second.energy * 1.4; v += hit.second.valence * 1.4
            i += hit.second.intensity * 1.4; n += hit.second.intimacy * 1.4
            w += 1.4
        }
    }
    val text = canonical("${song.title} ${song.album}")
    var de = 0.0; var dv = 0.0; var di = 0.0; var dn = 0.0
    for ((words, delta) in MOOD_LEXICAL_CUES) {
        if (words.any { text.contains(it) }) {
            de += delta.energy; dv += delta.valence; di += delta.intensity; dn += delta.intimacy
        }
    }
    return MoodVector(
        energy = (e / w + de.coerceIn(-0.32, 0.32)).coerceIn(0.0, 1.0),
        valence = (v / w + dv.coerceIn(-0.32, 0.32)).coerceIn(0.0, 1.0),
        intensity = (i / w + di.coerceIn(-0.32, 0.32)).coerceIn(0.0, 1.0),
        intimacy = (n / w + dn.coerceIn(-0.32, 0.32)).coerceIn(0.0, 1.0),
    )
}

fun classifyMood(vec: MoodVector): String = when {
    vec.energy < 0.36 && vec.valence < 0.35 -> "Melancholic"
    vec.energy < 0.38 && vec.intimacy >= 0.80 -> "Focus"
    vec.energy < 0.42 -> "Chill"
    vec.intimacy >= 0.62 && vec.valence < 0.48 -> "Late Night"
    vec.energy >= 0.82 && vec.valence < 0.40 -> "Intense"
    vec.valence >= 0.68 && vec.energy >= 0.60 -> "Upbeat"
    else -> "Energetic"
}

fun dwellEngagement(seconds: Int, duration: Double, completed: Boolean): Double {
    val ratio = if (duration > 0) (seconds / duration).coerceIn(0.0, 1.0) else 0.0
    return when {
        completed || ratio >= 0.85 || seconds >= 180 -> 1.35
        seconds >= 25 || (ratio >= 0.35 && seconds >= 12) -> 0.55 + ratio * 0.65
        seconds >= 12 -> 0.22
        seconds >= 2 -> -(0.40 - (seconds / 12.0) * 0.24)
        else -> 0.0
    }
}

fun moodSimilarity(a: MoodVector, b: MoodVector): Double {
    val de = (a.energy - b.energy) * 1.25
    val dv = (a.valence - b.valence) * 1.15
    val di = (a.intensity - b.intensity) * 1.0
    val dn = (a.intimacy - b.intimacy) * 0.95
    return (1.0 - sqrt(de * de + dv * dv + di * di + dn * dn) / 2.2).coerceIn(0.0, 1.0)
}

/**
 * Infers the listener's live automatic session mood from local dwell/skip signals,
 * current playback, and local time-of-day prior. Never leaves the device.
 */
fun inferListeningMood(
    songs: List<Song>,
    signals: List<MoodSignal>,
    current: Song?,
    now: Long = System.currentTimeMillis(),
): MoodVector {
    val byId = songs.associateBy { it.id }
    val recent = signals.sortedByDescending { it.at }.take(14)
    val hour = java.util.Calendar.getInstance().apply { timeInMillis = now }.get(java.util.Calendar.HOUR_OF_DAY)
    val prior = when {
        hour >= 22 || hour < 5 -> MoodVector(0.38, 0.40, 0.36, 0.74)
        hour in 6..10 -> MoodVector(0.56, 0.64, 0.46, 0.48)
        else -> MoodVector(0.54, 0.56, 0.48, 0.52)
    }
    var e = prior.energy * 0.28; var v = prior.valence * 0.28
    var i = prior.intensity * 0.28; var n = prior.intimacy * 0.28; var w = 0.28
    val skips = mutableListOf<Pair<MoodVector, Double>>()
    var positives = 0
    recent.forEachIndexed { idx, sig ->
        val song = byId[sig.songId] ?: return@forEachIndexed
        val eng = dwellEngagement(sig.seconds, if (sig.duration > 0) sig.duration else song.duration, sig.completed)
        if (abs(eng) < 0.01) return@forEachIndexed
        val ageHours = ((now - sig.at).coerceAtLeast(0L)) / 3_600_000.0
        val recency = 0.78.pow(idx) * (0.25 + 0.75 * exp(-ageHours / 18.0))
        val vec = analyzeSongMood(song)
        if (eng > 0) {
            val weight = recency * eng
            e += vec.energy * weight; v += vec.valence * weight; i += vec.intensity * weight; n += vec.intimacy * weight
            w += weight; positives++
        } else {
            skips.add(vec to (recency * abs(eng)))
        }
    }
    if (positives == 0 && current != null) {
        val cur = analyzeSongMood(current)
        e += cur.energy * 1.5; v += cur.valence * 1.5; i += cur.intensity * 1.5; n += cur.intimacy * 1.5
        w += 1.5
    }
    var ve = e / w; var vv = v / w; var vi = i / w; var vn = n / w
    for ((vec, sw) in skips) {
        val push = minOf(0.28, sw * 0.28)
        ve += (ve - vec.energy) * push
        vv += (vv - vec.valence) * push
        vi += (vi - vec.intensity) * push
        vn += (vn - vec.intimacy) * push
    }
    return MoodVector(ve.coerceIn(0.0, 1.0), vv.coerceIn(0.0, 1.0), vi.coerceIn(0.0, 1.0), vn.coerceIn(0.0, 1.0))
}

/** Local mood-aware Autoplay picker for Android when the queue ends. */
fun pickAutoplayNext(
    library: List<Song>,
    current: Song,
    recentIds: List<String>,
    signals: List<MoodSignal>,
    draw: Double = Math.random(),
): Song? {
    val avoid = recentIds.takeLast(12).toSet()
    val all = library.filter { it.id != current.id }
    if (all.isEmpty()) return null
    val candidates = all.filterNot { it.id in avoid }.ifEmpty { all }
    val session = inferListeningMood(library, signals, current)
    val curMood = analyzeSongMood(current)
    val weighted = candidates.map { song ->
        val mood = analyzeSongMood(song)
        val sim = moodSimilarity(mood, session) * 0.65 + moodSimilarity(mood, curMood) * 0.35
        val sameGenre = song.genre.isNotBlank() && song.genre.equals(current.genre, ignoreCase = true)
        val sameArtist = song.artist.equals(current.artist, ignoreCase = true)
        val durFit = if (song.duration > 0 && current.duration > 0) {
            minOf(song.duration, current.duration) / maxOf(song.duration, current.duration)
        } else 0.5
        val score = (0.8 + maxOf(0.0, sim - 0.32) * 6.5 + (if (sameGenre) 2.4 else 0.0) + durFit + (if (song.favorite) 0.5 else 0.0)) *
            (if (sameArtist) 0.45 else 1.0) *
            (if (sim < 0.42) 0.35 else 1.0)
        song to maxOf(0.05, score)
    }
    val total = weighted.sumOf { it.second }
    var ticket = draw.coerceIn(0.0, 0.999999) * total
    for ((song, weight) in weighted) {
        ticket -= weight
        if (ticket <= 0) return song
    }
    return weighted.first().first
}

/** Locks up to 3 distinct cover songs for the calendar day so covers never flicker. */
fun mixCovers(pool: List<Song>, day: String, label: String): List<Song> {
    val ordered = pool.distinctBy { it.id }.sortedBy { mixDayHash("cover:$day:${label.lowercase()}:${it.id}") }
    val picked = ArrayList<Song>(3)
    val seenAlbums = HashSet<String>()
    for (song in ordered) {
        val key = "${song.artist.lowercase()}|${song.album.lowercase()}"
        if (seenAlbums.add(key)) {
            picked.add(song)
            if (picked.size >= 3) return picked
        }
    }
    for (song in ordered) {
        if (picked.none { it.id == song.id }) {
            picked.add(song)
            if (picked.size >= 3) break
        }
    }
    return picked
}

private fun mixDayHash(seed: String): Int {
    var h = 2166136261L
    for (c in seed) {
        h = (h xor c.code.toLong()) * 16777619L
        h = h and 0xFFFFFFFFL
    }
    return h.toInt()
}

private fun curateMixSongs(pool: List<Song>, day: String, label: String, limit: Int): List<Song> {
    val maxCount = limit.coerceIn(0, 20)
    if (maxCount == 0 || pool.isEmpty()) return emptyList()
    val shuffled = pool.distinctBy { it.id }.sortedBy { mixDayHash("$day:$label:${it.id}") }
    val distinctArtists = shuffled.map { it.artist.trim().lowercase() }.distinct().size
    val maxPerArtist = when {
        distinctArtists >= 6 -> 2
        distinctArtists >= 3 -> 3
        else -> maxCount
    }

    val picked = ArrayList<Song>(maxCount)
    val overflow = ArrayList<Song>()
    val counts = HashMap<String, Int>()
    for (song in shuffled) {
        val key = song.artist.trim().lowercase()
        val seen = counts[key] ?: 0
        if (seen < maxPerArtist) {
            picked.add(song)
            counts[key] = seen + 1
        } else {
            overflow.add(song)
        }
        if (picked.size >= maxCount) break
    }
    for (song in overflow) {
        if (picked.size >= maxCount) break
        picked.add(song)
    }

    // Spread artists widely (4-slot cooldown) to avoid repeating any artist back-to-back.
    val remaining = picked.toMutableList()
    val ordered = ArrayList<Song>(picked.size)
    val recentArtists = ArrayDeque<String>()
    while (remaining.isNotEmpty()) {
        var bestIdx = 0
        var bestPenalty = Int.MAX_VALUE
        for (i in remaining.indices) {
            val key = remaining[i].artist.trim().lowercase()
            val lastPos = recentArtists.lastIndexOf(key)
            var penalty = if (lastPos < 0) 0 else (lastPos + 1) * 100
            if (ordered.isNotEmpty() && ordered.last().artist.trim().lowercase() == key) {
                penalty += 10000
            }
            if (penalty < bestPenalty) {
                bestPenalty = penalty
                bestIdx = i
                if (penalty == 0) break
            }
        }
        val chosen = remaining.removeAt(bestIdx)
        ordered.add(chosen)
        recentArtists.addLast(chosen.artist.trim().lowercase())
        if (recentArtists.size > 4) recentArtists.removeFirst()
    }
    return ordered
}

/**
 * Up to three complete Daily Mixes (min 7 songs, max 20 songs, max 3 mixes),
 * rebuilt each morning with day-locked covers, per-artist caps, wide spacing
 * and mood grouping for untagged libraries.
 */
fun dailyMixes(songs: List<Song>, day: String, limit: Int = MAX_DAILY_MIX_TRACKS): List<DailyMix> {
    val unique = songs.distinctBy { it.id }
    val byGenre = unique
        .filter { it.genre.isNotBlank() }
        .groupBy { it.genre.trim() }
        .filterValues { it.size >= MIN_DAILY_MIX_TRACKS }
        .entries
        .sortedWith(compareByDescending<Map.Entry<String, List<Song>>> { it.value.size }.thenBy { it.key.lowercase() })

    val chosenGroups: List<Pair<String, List<Song>>> = when {
        byGenre.isNotEmpty() -> {
            val primary = byGenre.first().toPair()
            val rotated = byGenre.drop(1)
                .sortedBy { mixDayHash("$day:slot:${it.key.lowercase()}") }
                .take(MAX_DAILY_MIXES - 1)
                .map { it.toPair() }
            listOf(primary) + rotated
        }
        unique.size >= MIN_DAILY_MIX_TRACKS -> {
            val byMood = unique
                .groupBy { classifyMood(analyzeSongMood(it)) }
                .filterValues { it.size >= MIN_DAILY_MIX_TRACKS }
                .entries
                .sortedWith(compareByDescending<Map.Entry<String, List<Song>>> { it.value.size }.thenBy { it.key.lowercase() })
                .take(MAX_DAILY_MIXES)
                .map { it.toPair() }
            if (byMood.isNotEmpty()) byMood else listOf("Daily Mix" to unique)
        }
        else -> emptyList()
    }

    return chosenGroups
        .take(MAX_DAILY_MIXES)
        .map { (label, group) ->
            DailyMix(
                label = label,
                songs = curateMixSongs(group, day, label, limit.coerceAtMost(MAX_DAILY_MIX_TRACKS)),
                covers = mixCovers(group, day, label),
            )
        }
        .filter { it.songs.size >= MIN_DAILY_MIX_TRACKS }
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

/** Full year of local history survives so Weekly, Monthly and Yearly Remix stay complete. */
const val HISTORY_DAYS = 366
const val HISTORY_PLAYS = 20000

/** The oldest plays above this count fall away first. */
const val MAX_PLAYS = 2000

/** Half the song, at most thirty seconds, and never less than five. */
fun playThreshold(duration: Double): Int =
    if (!duration.isFinite() || duration <= 0) PLAY_THRESHOLD_SECONDS
    else maxOf(5, minOf(PLAY_THRESHOLD_SECONDS, (duration / 2).toInt()))

fun countsAsPlay(seconds: Int, duration: Double): Boolean = seconds >= playThreshold(duration)

/** One history event per playback, excluding pauses, stalls and seek jumps. */
class ListeningCounter {
    private var serial: Long? = null
    private var songId: String? = null
    private var startedAt = 0L
    private var heard = 0.0
    private var last: Double? = null
    private var recorded = false

    fun sample(serial: Long, songId: String?, playing: Boolean, position: Double, duration: Double, now: Long): Play? {
        if (this.serial != serial || this.songId != songId) {
            this.serial = serial
            this.songId = songId
            startedAt = now
            heard = 0.0
            last = null
            recorded = false
        }
        if (!playing || songId == null) {
            last = null
            return null
        }
        if (recorded || !position.isFinite() || position < 0) return null
        val previous = last
        if (previous != null) {
            val step = position - previous
            if (step > 0 && step <= 2.5) heard += step
        }
        last = position
        if (heard < playThreshold(duration)) return null
        recorded = true
        return Play(songId, startedAt, heard.toInt(), duration > 0 && position >= duration - 1)
    }
}

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

/**
 * "1 song", "12 songs": a count and its word, singular when it should be.
 *
 * A summary reading "1 albums" is the kind of small wrongness that makes an app
 * look unfinished, and there are enough counts in the interface to be worth one
 * helper for all of them.
 */
fun count(value: Int, singular: String, plural: String = singular + "s"): String =
    "$value ${if (value == 1) singular else plural}"

/** Time in words: "3 min" reads better than "0:03:00" on a listening page. */
fun listeningTime(seconds: Int): String {
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
/** One day of the week, so the recap can be drawn as bars rather than described. */
data class DaySlice(val at: Long, val seconds: Int, val plays: Int)

/** The week split by the genre tag on the files. */
data class GenreSlice(val genre: String, val seconds: Int, val plays: Int)

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
    /** Seven entries, oldest first, quiet days included. */
    val days: List<DaySlice> = emptyList(),
    /** Plays per hour of the local day, 0–23. */
    val hours: List<Int> = emptyList(),
    /** Biggest first; untagged songs are counted in the week but in no slice. */
    val genres: List<GenreSlice> = emptyList(),
)

/** The last four weeks, newest first, quiet ones included. */
fun weeklyRecaps(plays: List<Play>, songs: List<Song>, now: Long, weeks: Int = 4): List<WeekRecap> =
    (0 until weeks.coerceIn(1, 52)).map { weekRecap(plays, songs, now, it) }

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

fun weekRecap(plays: List<Play>, songs: List<Song>, now: Long, weeksAgo: Int = 0): WeekRecap {
    val byId = songs.associateBy { it.id }
    val end = startOfDay(now) - 7L * 24 * 60 * 60 * 1000 * weeksAgo.coerceAtLeast(0)
    val start = end - 6 * 24 * 60 * 60 * 1000L
    val finish = end + 24 * 60 * 60 * 1000L
    val previousStart = start - 7 * 24 * 60 * 60 * 1000L
    // Bounded on both sides: a week before this one must not swallow the plays
    // that belong to the week after it.
    val week = plays.filter { it.at >= start && it.at < finish }
    val previous = plays.filter { it.at in previousStart until start }

    val counts = mutableMapOf<String, Int>()
    val artists = mutableMapOf<String, Int>()
    val daySeconds = IntArray(7)
    val dayPlays = IntArray(7)
    val hours = IntArray(24)
    val genres = mutableMapOf<String, GenreSlice>()
    val day = 24L * 60 * 60 * 1000
    for (play in week) {
        // The shape of the week first: it counts every play, deleted songs too.
        val dayIndex = (((startOfDay(play.at) - start) / day).toInt()).coerceIn(0, 6)
        daySeconds[dayIndex] += play.seconds
        dayPlays[dayIndex] += 1
        val hour = java.util.Calendar.getInstance().apply { timeInMillis = play.at }
            .get(java.util.Calendar.HOUR_OF_DAY)
        hours[hour] += 1
        val song = byId[play.songId] ?: continue
        counts[song.id] = (counts[song.id] ?: 0) + 1
        val name = song.artist.ifBlank { "Unknown artist" }
        artists[name] = (artists[name] ?: 0) + 1
        val genre = song.genre.trim()
        if (genre.isNotEmpty()) {
            val seen = genres[genre]
            genres[genre] = GenreSlice(
                genre = genre,
                seconds = (seen?.seconds ?: 0) + play.seconds,
                plays = (seen?.plays ?: 0) + 1,
            )
        }
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
        // Every play this week, including songs that have since been deleted:
        // they were listened to, and the bars have to add up to the headline.
        seconds = week.sumOf { it.seconds },
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
        days = (0 until 7).map { index ->
            DaySlice(at = start + index * day, seconds = daySeconds[index], plays = dayPlays[index])
        },
        hours = hours.toList(),
        genres = genres.values.sortedByDescending { it.seconds },
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

private fun rangeRecap(
    plays: List<Play>,
    songs: List<Song>,
    start: Long,
    finish: Long,
    prevStart: Long,
    prevFinish: Long,
    now: Long,
    buckets: Int,
): WeekRecap {
    val byId = songs.associateBy { it.id }
    val span = plays.filter { it.at in start until finish }
    val prev = plays.filter { it.at in prevStart until prevFinish }
    val bucketCount = buckets.coerceIn(1, 12)
    val bucketSeconds = IntArray(bucketCount)
    val bucketPlays = IntArray(bucketCount)
    val hours = IntArray(24)
    val counts = mutableMapOf<String, Int>()
    val artists = mutableMapOf<String, Int>()
    val genres = mutableMapOf<String, GenreSlice>()
    val totalMs = (finish - start).coerceAtLeast(1L)
    for (play in span) {
        val idx = (((play.at - start) * bucketCount) / totalMs).toInt().coerceIn(0, bucketCount - 1)
        bucketSeconds[idx] += play.seconds
        bucketPlays[idx] += 1
        val hour = java.util.Calendar.getInstance().apply { timeInMillis = play.at }
            .get(java.util.Calendar.HOUR_OF_DAY)
        hours[hour] += 1
        val song = byId[play.songId] ?: continue
        counts[song.id] = (counts[song.id] ?: 0) + 1
        val name = song.artist.ifBlank { "Unknown artist" }
        artists[name] = (artists[name] ?: 0) + 1
        val genre = song.genre.trim()
        if (genre.isNotEmpty()) {
            val seen = genres[genre]
            genres[genre] = GenreSlice(genre, (seen?.seconds ?: 0) + play.seconds, (seen?.plays ?: 0) + 1)
        }
    }
    val top = counts.entries
        .mapNotNull { entry -> byId[entry.key]?.let { it to entry.value } }
        .sortedWith(compareByDescending<Pair<Song, Int>> { it.second }.thenBy { canonical(it.first.title) })
    val mix = top.map { it.first }.toMutableList()
    if (mix.size < REMIX_LENGTH) {
        val seen = mix.map { it.id }.toMutableSet()
        for ((song, _) in listeningSummary(plays, songs, now).topSongs) {
            if (mix.size >= REMIX_LENGTH) break
            if (seen.add(song.id)) mix.add(song)
        }
    }
    val step = (totalMs / bucketCount).coerceAtLeast(86_400_000L)
    return WeekRecap(
        start = start,
        end = finish - 1L,
        seconds = span.sumOf { it.seconds },
        plays = span.size,
        tracks = counts.size,
        artists = artists.size,
        previousSeconds = prev.sumOf { it.seconds },
        topSongs = top.take(8),
        topArtists = artists.entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key.lowercase() })
            .take(3)
            .map { it.key to it.value },
        songs = mix.take(REMIX_LENGTH),
        days = (0 until bucketCount).map { i -> DaySlice(start + i * step, bucketSeconds[i], bucketPlays[i]) },
        hours = hours.toList(),
        genres = genres.values.sortedByDescending { it.seconds },
    )
}

/** Monthly Remix recap for a calendar month (0 = current month). */
fun monthlyRecap(plays: List<Play>, songs: List<Song>, now: Long, monthsAgo: Int = 0): WeekRecap {
    val cal = java.util.Calendar.getInstance().apply {
        timeInMillis = startOfDay(now)
        add(java.util.Calendar.MONTH, -monthsAgo.coerceAtLeast(0))
        set(java.util.Calendar.DAY_OF_MONTH, 1)
    }
    val start = cal.timeInMillis
    val finish = (cal.clone() as java.util.Calendar).apply { add(java.util.Calendar.MONTH, 1) }.timeInMillis
    val prevStart = (cal.clone() as java.util.Calendar).apply { add(java.util.Calendar.MONTH, -1) }.timeInMillis
    return rangeRecap(plays, songs, start, finish, prevStart, start, now, buckets = 8)
}

/** Yearly Remix recap for a calendar year (0 = current year). */
fun yearlyRecap(plays: List<Play>, songs: List<Song>, now: Long, yearsAgo: Int = 0): WeekRecap {
    val cal = java.util.Calendar.getInstance().apply {
        timeInMillis = startOfDay(now)
        add(java.util.Calendar.YEAR, -yearsAgo.coerceAtLeast(0))
        set(java.util.Calendar.MONTH, java.util.Calendar.JANUARY)
        set(java.util.Calendar.DAY_OF_MONTH, 1)
    }
    val start = cal.timeInMillis
    val finish = (cal.clone() as java.util.Calendar).apply { add(java.util.Calendar.YEAR, 1) }.timeInMillis
    val prevStart = (cal.clone() as java.util.Calendar).apply { add(java.util.Calendar.YEAR, -1) }.timeInMillis
    return rangeRecap(plays, songs, start, finish, prevStart, start, now, buckets = 12)
}

fun monthRange(start: Long): String =
    java.text.SimpleDateFormat("MMMM yyyy", java.util.Locale.getDefault()).format(java.util.Date(start))

fun yearRange(start: Long): String =
    java.util.Calendar.getInstance().apply { timeInMillis = start }.get(java.util.Calendar.YEAR).toString()
