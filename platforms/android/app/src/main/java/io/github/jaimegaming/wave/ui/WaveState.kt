package io.github.jaimegaming.wave.ui

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.github.jaimegaming.wave.BLEND_SECONDS
import io.github.jaimegaming.wave.DailyMix
import io.github.jaimegaming.wave.Library
import io.github.jaimegaming.wave.ListeningSummary
import io.github.jaimegaming.wave.ListeningCounter
import io.github.jaimegaming.wave.LyricsClient
import io.github.jaimegaming.wave.MoodSignal
import io.github.jaimegaming.wave.Play
import io.github.jaimegaming.wave.Player
import io.github.jaimegaming.wave.Playlist
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.dailyMixes
import io.github.jaimegaming.wave.listeningSummary
import io.github.jaimegaming.wave.monthlyRecap
import io.github.jaimegaming.wave.pickAutoplayNext
import io.github.jaimegaming.wave.rankSongs
import io.github.jaimegaming.wave.weekRecap
import io.github.jaimegaming.wave.weeklyRecaps
import io.github.jaimegaming.wave.yearlyRecap
import io.github.jaimegaming.wave.wave
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale








enum class Destination(val label: String, val icon: String) {
    Home("Home", "home"),
    Search("Search", "search"),
    Library("Library", "library"),
    Remix("Remix", "remix"),
    Settings("Settings", "settings"),
}


enum class Shelf(val label: String) {
    Songs("Songs"),
    Albums("Albums"),
    Artists("Artists"),
    Playlists("Playlists"),
    Favorites("Favorites"),
}


sealed interface Open {
    data class Album(val name: String) : Open
    data class Artist(val name: String) : Open
    data class Playlist(val id: String) : Open
    data class Mix(val label: String) : Open
}


sealed interface Opening {
    data object Default : Opening
    data object Player : Opening
    data object Favorites : Opening
    data class Where(val destination: Destination) : Opening
}








@Stable
class WaveState(
    private val context: Context,
    private val repository: Library,
    val player: Player,
    private val client: LyricsClient,
) {
    var songs by mutableStateOf(repository.load())
        private set
    var playlists by mutableStateOf(repository.loadPlaylists())
        private set
    var plays by mutableStateOf(repository.loadPlays())
        private set
    var summary by mutableStateOf(listeningSummary(plays, songs, System.currentTimeMillis()))
        private set
    var recap by mutableStateOf(weekRecap(plays, songs, System.currentTimeMillis()))

    var recaps by mutableStateOf(weeklyRecaps(plays, songs, System.currentTimeMillis()))
        private set
    var monthlyRecap by mutableStateOf(monthlyRecap(plays, songs, System.currentTimeMillis()))
        private set
    var yearlyRecap by mutableStateOf(yearlyRecap(plays, songs, System.currentTimeMillis()))
        private set
    var remixPeriod by mutableStateOf("weekly")
    var autoplayEnabled by mutableStateOf(context.wave.preferences().getBoolean(KEY_AUTOPLAY, true))
        private set
    private val moodSignals = mutableListOf<MoodSignal>()
    private val recentPlayedIds = mutableListOf<String>()

    var destination by mutableStateOf(Destination.Home)
    var shelf by mutableStateOf(Shelf.Songs)
    var open by mutableStateOf<Open?>(null)
    var query by mutableStateOf("")
    var nowPlayingOpen by mutableStateOf(false)
    var queueOpen by mutableStateOf(false)
    var addOpen by mutableStateOf(false)
    var options by mutableStateOf<Song?>(null)

    var optionsPlaylist by mutableStateOf<Playlist?>(null)
    var addToPlaylist by mutableStateOf<Song?>(null)
    var editing by mutableStateOf<Song?>(null)
    var playlistEditor by mutableStateOf<Playlist?>(null)
    var newPlaylistOpen by mutableStateOf(false)
    var lyricsOpen by mutableStateOf(true)
    var busy by mutableStateOf(false)
        private set
    var notice by mutableStateOf("")

    var sleepMinutes by mutableStateOf(0)
    var sleepChoice by mutableStateOf(0)
        private set
    var mixEnabled by mutableStateOf(context.wave.preferences().getBoolean(KEY_MIX, true))
        private set
    var onlineLyrics by mutableStateOf(context.wave.preferences().getBoolean(KEY_LYRICS, false))
        private set


    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var sleepJob: Job? = null
    private val listeningCounter = ListeningCounter()








    private val listener: () -> Unit = {
        sampleListening()
        io.github.jaimegaming.wave.PlaybackService.refresh(context)
    }

    private var lastObservedSongId: String? = null
    private var lastObservedSerial: Long = -1L
    private var lastObservedPos: Double = 0.0
    private var lastObservedDuration: Double = 0.0

    init {
        player.crossfade = if (mixEnabled) BLEND_SECONDS else 0.0
        player.onQueueEnded = {
            val activeSong = player.current
            if (!autoplayEnabled || activeSong == null || songs.size < 2) null
            else pickAutoplayNext(songs, activeSong, plays.takeLast(32).map { it.songId } + recentPlayedIds, moodSignals)
        }
        player.observe(listener)
        scope.launch {
            while (true) {
                delay(1000)
                sampleListening()
            }
        }
    }

    private fun recordSignal(songId: String, seconds: Int, duration: Double, completed: Boolean) {
        if (seconds < 2) return
        moodSignals.add(MoodSignal(songId, seconds, duration, completed, System.currentTimeMillis()))
        if (moodSignals.size > 48) moodSignals.removeAt(0)
    }

    private fun refreshAnalytics() {
        val now = System.currentTimeMillis()
        summary = listeningSummary(plays, songs, now)
        recap = weekRecap(plays, songs, now)
        recaps = weeklyRecaps(plays, songs, now)
        monthlyRecap = monthlyRecap(plays, songs, now)
        yearlyRecap = yearlyRecap(plays, songs, now)
    }











    private fun sampleListening() {
        val song = player.current
        val serial = player.playbackSerial
        val duration = player.duration.takeIf { it > 0 } ?: song?.duration ?: 0.0
        if (song?.id != lastObservedSongId || serial != lastObservedSerial) {
            lastObservedSongId?.let { prevId ->
                val secs = kotlin.math.round(lastObservedPos).toInt()
                val completed = lastObservedDuration > 0 && lastObservedPos >= lastObservedDuration * 0.85
                recordSignal(prevId, secs, lastObservedDuration, completed)
            }
            if (song != null) {
                recentPlayedIds.add(song.id)
                if (recentPlayedIds.size > 24) recentPlayedIds.removeAt(0)
            }
            lastObservedSongId = song?.id
            lastObservedSerial = serial
            lastObservedPos = 0.0
            lastObservedDuration = duration
        } else {
            lastObservedPos = maxOf(lastObservedPos, player.time)
            if (duration > 0) lastObservedDuration = duration
        }
        val play = listeningCounter.sample(
            serial = serial,
            songId = song?.id,
            playing = player.playing,
            position = player.time,
            duration = duration,
            now = System.currentTimeMillis(),
        )
        if (play != null) record(play.songId, play.at, play.seconds, play.completed)
    }

    private fun record(songId: String, at: Long, seconds: Int, completed: Boolean) {
        val duration = songs.find { it.id == songId }?.duration ?: 0.0
        recordSignal(songId, seconds, duration, completed)
        scope.launch {
            withContext(Dispatchers.IO) {
                repository.addPlay(Play(songId, at, seconds, completed))
                repository.save(
                    repository.load().map {
                        if (it.id == songId) it.copy(playCount = it.playCount + 1, lastPlayed = at) else it
                    },
                )
            }
            plays = repository.loadPlays()
            songs = repository.load()
            refreshAnalytics()
        }
    }


    fun setSleepTimer(minutes: Int) {
        sleepJob?.cancel()
        sleepChoice = minutes.coerceIn(0, 180)
        sleepMinutes = sleepChoice
        if (sleepChoice == 0) return
        val deadline = android.os.SystemClock.elapsedRealtime() + sleepChoice * 60_000L
        sleepJob = scope.launch {
            while (true) {
                val remaining = deadline - android.os.SystemClock.elapsedRealtime()
                if (remaining <= 0) break
                sleepMinutes = ((remaining + 59_999L) / 60_000L).toInt()
                delay(minOf(remaining, 1000L))
            }
            sleepMinutes = 0
            sleepChoice = 0
            player.pause()
            notice = Loc.t("The sleep timer stopped the music.")
        }
    }

    fun clearHistory() {
        scope.launch {
            withContext(Dispatchers.IO) { repository.clearPlays() }
            plays = emptyList()
            moodSignals.clear()
            refreshAnalytics()
            notice = Loc.t("Listening history cleared.")
        }
    }



    fun setMix(enabled: Boolean) {
        mixEnabled = enabled
        player.crossfade = if (enabled) BLEND_SECONDS else 0.0
        context.wave.preferences().edit().putBoolean(KEY_MIX, enabled).apply()
    }

    fun setAutoplay(enabled: Boolean) {
        autoplayEnabled = enabled
        context.wave.preferences().edit().putBoolean(KEY_AUTOPLAY, enabled).apply()
    }

    fun setLyricsOnline(enabled: Boolean) {
        onlineLyrics = enabled
        context.wave.preferences().edit().putBoolean(KEY_LYRICS, enabled).apply()
    }




    var recentSearches by mutableStateOf(
        context.wave.preferences()
            .getString(KEY_RECENT, "").orEmpty()
            .split(RECENT_SEPARATOR)
            .filter { it.isNotBlank() },
    )
        private set

    fun rememberSearch(term: String) {
        val words = term.trim()
        if (words.length < 3) return
        val next = (listOf(words) + recentSearches.filterNot { it.equals(words, ignoreCase = true) }).take(6)
        if (next == recentSearches) return
        recentSearches = next
        context.wave.preferences().edit().putString(KEY_RECENT, next.joinToString(RECENT_SEPARATOR)).apply()
    }

    fun clearRecentSearches() {
        recentSearches = emptyList()
        context.wave.preferences().edit().remove(KEY_RECENT).apply()
    }




    fun visible(): List<Song> = rankSongs(songs, query)

    fun favorites(): List<Song> = songs.filter { it.favorite }

    fun albums(): Map<String, List<Song>> = songs
        .groupBy { it.album.ifBlank { "Unknown album" } }
        .toSortedMap(String.CASE_INSENSITIVE_ORDER)

    fun artists(): Map<String, List<Song>> = songs
        .groupBy { it.artist.ifBlank { "Unknown artist" } }
        .toSortedMap(String.CASE_INSENSITIVE_ORDER)






    fun mixes(): List<DailyMix> {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val signature = "v3:${songs.size}:" + songs.map { it.id }.sorted().take(48).joinToString(",")
        val byId = songs.associateBy { it.id }
        val preferences = context.wave.preferences()
        val savedDay = preferences.getString(KEY_MIX_DAY, null)
        val savedSig = preferences.getString(KEY_MIX_SIG, null)
        val savedRaw = preferences.getString(KEY_MIX_DATA, null)
        if (savedDay == today && savedSig == signature && !savedRaw.isNullOrBlank()) {
            val hydrated = savedRaw.split("\u001e").mapNotNull { record ->
                val parts = record.split("\u001f")
                if (parts.size < 2) return@mapNotNull null
                val label = parts[0]
                val trackList = parts[1].split(",").mapNotNull { byId[it] }
                if (trackList.size < 7) return@mapNotNull null
                val covers = parts.getOrNull(2)?.split(",")?.mapNotNull { byId[it] }.orEmpty()
                DailyMix(label = label, songs = trackList, covers = covers.ifEmpty { trackList.take(3) })
            }.take(3)
            if (hydrated.isNotEmpty()) return hydrated
        }
        if (busy) return emptyList()
        val built = dailyMixes(songs, today)
        if (built.isNotEmpty()) {
            val serialized = built.joinToString("\u001e") { mix ->
                "${mix.label}\u001f${mix.songs.joinToString(",") { it.id }}\u001f${mix.covers.joinToString(",") { it.id }}"
            }
            preferences.edit()
                .putString(KEY_MIX_DAY, today)
                .putString(KEY_MIX_SIG, signature)
                .putString(KEY_MIX_DATA, serialized)
                .apply()
        }
        return built
    }

    fun playlistSongs(playlist: Playlist): List<Song> {
        val byId = songs.associateBy { it.id }
        return playlist.trackIds.mapNotNull { byId[it] }
    }


    fun openSongs(): List<Song> = when (val target = open) {
        null -> emptyList()
        is Open.Album -> albums()[target.name].orEmpty()
        is Open.Artist -> artists()[target.name].orEmpty()
        is Open.Playlist -> playlists.find { it.id == target.id }?.let { playlistSongs(it) }.orEmpty()
        is Open.Mix -> mixes().find { it.label == target.label }?.songs.orEmpty()
    }

    fun openTitle(): String = when (val target = open) {
        null -> ""
        is Open.Album -> target.name
        is Open.Artist -> target.name
        is Open.Playlist -> playlists.find { it.id == target.id }?.name.orEmpty()
        is Open.Mix -> target.label
    }








    fun play(song: Song) {

        val around = openSongs().ifEmpty { if (query.isBlank()) songs else visible() }
        player.play(if (around.any { it.id == song.id }) around else songs, song)
    }

    fun playAll(list: List<Song>) {
        if (list.isNotEmpty()) player.play(list, list.first())
    }

    fun shuffleAll(list: List<Song>) {
        if (list.isNotEmpty()) playAll(list.shuffled())
    }

    fun update(song: Song) {
        val updated = songs.map { if (it.id == song.id) song else it }
        repository.save(updated)
        songs = updated
        summary = listeningSummary(plays, songs, System.currentTimeMillis())
    }

    fun toggleFavorite(song: Song) = update(song.copy(favorite = !song.favorite))

    fun delete(song: Song) {
        scope.launch {
            withContext(Dispatchers.IO) { repository.delete(song.id) }
            songs = repository.load()
            playlists = repository.loadPlaylists()
            refreshAnalytics()
        }
        notice = "${song.title} removed from this device."
    }









    fun saveRemix() {
        val songs = recap.songs
        if (songs.isEmpty()) return
        val name = "Remix · " + java.text.SimpleDateFormat("d MMM", java.util.Locale.getDefault())
            .format(java.util.Date(recap.end))
        val playlist = repository.createPlaylist(name)
        repository.updatePlaylist(playlist.copy(trackIds = songs.map { it.id }))
        playlists = repository.loadPlaylists()
        notice = Loc.t("Remix saved as a playlist.")
    }


    fun saveDailyMix(label: String, songs: List<Song>) {
        if (songs.isEmpty()) return
        val day = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.ROOT).format(java.util.Date())
        fun name(index: Int): String {
            if (index == 1) return "$day's Daily Mix"
            val suffix = if (index % 100 in 11..13) "th" else when (index % 10) { 1 -> "st"; 2 -> "nd"; 3 -> "rd"; else -> "th" }
            return "$day's $index$suffix Daily Mix"
        }
        val existing = playlists.map { it.name.lowercase(java.util.Locale.ROOT) }.toSet()
        var index = 1
        while (name(index).lowercase(java.util.Locale.ROOT) in existing) index++
        val playlist = repository.createPlaylist(name(index))
        repository.updatePlaylist(playlist.copy(trackIds = songs.map { it.id }))
        playlists = repository.loadPlaylists()
        notice = Loc.t("Daily mix saved as a playlist.")
    }

    fun createPlaylist(name: String) {
        val playlist = repository.createPlaylist(name)
        playlists = repository.loadPlaylists()
        shelf = Shelf.Playlists
        open = Open.Playlist(playlist.id)
    }

    fun renamePlaylist(playlist: Playlist, name: String) {
        val trimmed = name.trim().take(100)
        if (trimmed.isEmpty()) return
        repository.updatePlaylist(playlist.copy(name = trimmed))
        playlists = repository.loadPlaylists()
    }

    fun deletePlaylist(playlist: Playlist) {
        repository.deletePlaylist(playlist.id)
        playlists = repository.loadPlaylists()
        if (open == Open.Playlist(playlist.id)) open = null
    }

    fun putInPlaylist(playlist: Playlist, song: Song) {
        if (song.id in playlist.trackIds) {
            notice = Loc.t("Already in {name}.", mapOf("name" to playlist.name))
            return
        }
        repository.updatePlaylist(playlist.copy(trackIds = playlist.trackIds + song.id))
        playlists = repository.loadPlaylists()
        notice = Loc.t("Added to {name}.", mapOf("name" to playlist.name))
    }

    fun removeFromPlaylist(playlist: Playlist, song: Song) {
        repository.updatePlaylist(playlist.copy(trackIds = playlist.trackIds - song.id))
        playlists = repository.loadPlaylists()
    }

    fun moveInPlaylist(playlist: Playlist, from: Int, to: Int) {
        val ids = playlist.trackIds.toMutableList()
        if (from !in ids.indices || to !in ids.indices) return
        ids.add(to, ids.removeAt(from))
        repository.updatePlaylist(playlist.copy(trackIds = ids))
        playlists = repository.loadPlaylists()
    }



    fun importMusic(uris: List<Uri>) {
        if (uris.isNotEmpty()) run { repository.importFiles(uris) }
    }

    fun importFromDevice() = run { repository.importFromMediaStore() }

    fun importFolder(tree: Uri) = run { repository.importFolder(tree) }

    private fun run(work: () -> Int) {
        scope.launch {
            busy = true
            try {
                val added = withContext(Dispatchers.IO) { work() }
                songs = repository.load()
                playlists = repository.loadPlaylists()
                refreshAnalytics()
                notice = when (added) {
                    0 -> Loc.t("Nothing new: those files are already here.")
                    1 -> Loc.t("One song added.")
                    else -> Loc.t("{count} songs added.", mapOf("count" to added.toString()))
                }
            } catch (error: Exception) {
                songs = repository.load()
                notice = error.message ?: Loc.t("The import did not finish.")
            } finally {
                busy = false
            }
        }
    }








    fun lookupLyrics(song: Song) {
        scope.launch {
            busy = true
            try {
                val raw = withContext(Dispatchers.IO) { client.find(song) }
                val latest = songs.find { it.id == song.id }
                if (latest != null && latest.title == song.title && latest.artist == song.artist && latest.lyrics.isEmpty()) {
                    update(latest.copy(lyrics = raw.ifEmpty { latest.lyrics }, checkedAt = System.currentTimeMillis()))
                }
                notice = if (raw.isEmpty()) Loc.t("No lyrics found for this song.") else ""
            } catch (error: Exception) {
                notice = error.message ?: Loc.t("The lyrics lookup failed.")
            } finally {
                busy = false
            }
        }
    }

    fun maybeLookupLyrics(song: Song) {
        if (!onlineLyrics || song.lyrics.isNotEmpty()) return
        if (System.currentTimeMillis() - song.checkedAt < LYRIC_COOLDOWN) return
        lookupLyrics(song)
    }

    fun clearMessage() {
        notice = ""
    }

    fun dispose() {
        player.stopObserving(listener)
        scope.cancel()
    }

    private companion object {
        const val KEY_MIX = "mix"
        const val KEY_AUTOPLAY = "autoplay"
        const val KEY_LYRICS = "lyrics"
        const val KEY_RECENT = "recent-searches"
        const val KEY_MIX_DAY = "daily-mixes-day"
        const val KEY_MIX_SIG = "daily-mixes-sig"
        const val KEY_MIX_DATA = "daily-mixes-data"

        const val RECENT_SEPARATOR = "\u001f"
        const val LYRIC_COOLDOWN = 15 * 60 * 1000L
    }
}

@Composable
fun rememberWaveState(context: Context): WaveState {
    val application = context.wave
    return remember {
        WaveState(context.applicationContext, application.library, application.player, LyricsClient())
    }
}

/** The listening page's headline number, in words. */
fun ListeningSummary.weekLabel(): String = io.github.jaimegaming.wave.listeningTime(weekSeconds)
