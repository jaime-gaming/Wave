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
import io.github.jaimegaming.wave.LyricsClient
import io.github.jaimegaming.wave.Play
import io.github.jaimegaming.wave.Player
import io.github.jaimegaming.wave.Playlist
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.dailyMixes
import io.github.jaimegaming.wave.listeningSummary
import io.github.jaimegaming.wave.playThreshold
import io.github.jaimegaming.wave.rankSongs
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

/** Where the bottom bar can take you. */
enum class Destination(val label: String, val glyph: String) {
    Home("Home", "⌂"),
    Search("Search", "⌕"),
    Library("Library", "♫"),
    Listening("Listening", "≋"),
    Settings("Settings", "⚙"),
}

/** The ways into the collection from the Library screen. */
enum class Shelf(val label: String) {
    Songs("Songs"),
    Albums("Albums"),
    Artists("Artists"),
    Playlists("Playlists"),
    Favorites("Favorites"),
}

/** A collection opened from a shelf, shown as its own page. */
sealed interface Open {
    data class Album(val name: String) : Open
    data class Artist(val name: String) : Open
    data class Playlist(val id: String) : Open
    data class Mix(val label: String) : Open
}

/** What a shortcut, the widget or the notification asked the app to open. */
sealed interface Opening {
    data object Default : Opening
    data object Player : Opening
    data object Favorites : Opening
    data class Where(val destination: Destination) : Opening
}

/**
 * Everything the screens read and write, in one place.
 *
 * The screens receive this and draw; the library, the player and the network work
 * live here. That keeps layout out of the logic and means a screen that loses its
 * composition — a rotation, a trip to another app — loses nothing.
 */
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

    var destination by mutableStateOf(Destination.Home)
    var shelf by mutableStateOf(Shelf.Songs)
    var open by mutableStateOf<Open?>(null)
    var query by mutableStateOf("")
    var nowPlayingOpen by mutableStateOf(false)
    var queueOpen by mutableStateOf(false)
    var addOpen by mutableStateOf(false)
    var options by mutableStateOf<Song?>(null)
    /** The playlist a song was opened from, when there is one. */
    var optionsPlaylist by mutableStateOf<Playlist?>(null)
    var addToPlaylist by mutableStateOf<Song?>(null)
    var editing by mutableStateOf<Song?>(null)
    var playlistEditor by mutableStateOf<Playlist?>(null)
    var newPlaylistOpen by mutableStateOf(false)
    var lyricsOpen by mutableStateOf(true)
    var busy by mutableStateOf(false)
        private set
    var notice by mutableStateOf("")
    /** Minutes left on the sleep timer; 0 when it is off. */
    var sleepMinutes by mutableStateOf(0)
        private set
    var mixEnabled by mutableStateOf(context.wave.preferences().getBoolean(KEY_MIX, true))
        private set
    var onlineLyrics by mutableStateOf(context.wave.preferences().getBoolean(KEY_LYRICS, false))
        private set

    /** Library work and lookups run here, never on the frame that draws a row. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var sleepJob: Job? = null
    private var heard = 0.0
    private var heardFrom = 0L
    private var lastSample = 0.0

    /**
     * One listener for the player's changes, plus a one-second beat.
     *
     * The changes alone are not enough to count listening: a song that simply
     * plays on between them would count for nothing, so the clock is read once a
     * second while it runs.
     */
    private val listener: () -> Unit = {
        sampleListening()
        io.github.jaimegaming.wave.PlaybackService.refresh(context)
    }

    init {
        player.crossfade = if (mixEnabled) BLEND_SECONDS else 0.0
        player.observe(listener)
        scope.launch {
            while (true) {
                delay(1000)
                sampleListening()
            }
        }
    }

    // --- listening ---------------------------------------------------------

    /**
     * Counts what was heard, from the player's own clock.
     *
     * The difference between two samples is added and a jump is ignored, so a
     * seek or a stall never inflates the count: the total is time actually spent
     * listening. A play is written as soon as the song passes its threshold, not
     * when it ends — a song skipped in its last ten seconds was still heard.
     */
    private fun sampleListening() {
        val song = player.current ?: return
        if (!player.playing) {
            lastSample = 0.0
            return
        }
        if (lastSample == 0.0) {
            lastSample = player.time
            heardFrom = System.currentTimeMillis()
            return
        }
        val step = player.time - lastSample
        if (step > 0 && step <= 2.5) heard += step
        lastSample = player.time
        val seconds = heard.toInt()
        if (seconds < playThreshold(player.duration.takeIf { it > 0 } ?: song.duration)) return
        val completed = player.duration > 0 && player.time >= player.duration - 1
        heard = 0.0
        record(song.id, heardFrom, seconds, completed)
    }

    private fun record(songId: String, at: Long, seconds: Int, completed: Boolean) {
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
            summary = listeningSummary(plays, songs, System.currentTimeMillis())
        }
    }

    /** Stops the music after a while, for falling asleep with something on. */
    fun setSleepTimer(minutes: Int) {
        sleepJob?.cancel()
        sleepMinutes = minutes.coerceIn(0, 180)
        if (sleepMinutes == 0) return
        sleepJob = scope.launch {
            while (sleepMinutes > 0) {
                delay(60_000)
                sleepMinutes--
            }
            player.pause()
            notice = "The sleep timer stopped the music."
        }
    }

    fun clearHistory() {
        scope.launch {
            withContext(Dispatchers.IO) { repository.clearPlays() }
            plays = emptyList()
            summary = listeningSummary(plays, songs, System.currentTimeMillis())
            notice = "Listening history cleared."
        }
    }

    // --- preferences -------------------------------------------------------

    fun setMix(enabled: Boolean) {
        mixEnabled = enabled
        player.crossfade = if (enabled) BLEND_SECONDS else 0.0
        context.wave.preferences().edit().putBoolean(KEY_MIX, enabled).apply()
    }

    fun setOnlineLyrics(enabled: Boolean) {
        onlineLyrics = enabled
        context.wave.preferences().edit().putBoolean(KEY_LYRICS, enabled).apply()
    }

    // --- browsing ----------------------------------------------------------

    /** Songs matching the search, best match first. */
    fun visible(): List<Song> = rankSongs(songs, query)

    fun favorites(): List<Song> = songs.filter { it.favorite }

    fun albums(): Map<String, List<Song>> = songs
        .groupBy { it.album.ifBlank { "Unknown album" } }
        .toSortedMap(String.CASE_INSENSITIVE_ORDER)

    fun artists(): Map<String, List<Song>> = songs
        .groupBy { it.artist.ifBlank { "Unknown artist" } }
        .toSortedMap(String.CASE_INSENSITIVE_ORDER)

    fun mixes(): List<DailyMix> =
        dailyMixes(songs, SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()))

    fun playlistSongs(playlist: Playlist): List<Song> {
        val byId = songs.associateBy { it.id }
        return playlist.trackIds.mapNotNull { byId[it] }
    }

    /** The songs behind whatever collection is open, and the queue it plays as. */
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

    // --- playing -----------------------------------------------------------

    /**
     * Plays a song inside the collection it was tapped in, so "next" means the
     * next thing on the screen the listener is looking at rather than the whole
     * library.
     */
    fun play(song: Song) {
        // "Next" means the next thing on the screen the song was tapped on.
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
            summary = listeningSummary(plays, songs, System.currentTimeMillis())
        }
        notice = "${song.title} removed from this device."
    }

    // --- playlists ---------------------------------------------------------

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

    fun addToPlaylist(playlist: Playlist, song: Song) {
        if (song.id in playlist.trackIds) {
            notice = "Already in ${playlist.name}."
            return
        }
        repository.updatePlaylist(playlist.copy(trackIds = playlist.trackIds + song.id))
        playlists = repository.loadPlaylists()
        notice = "Added to ${playlist.name}."
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

    // --- importing ---------------------------------------------------------

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
                summary = listeningSummary(plays, songs, System.currentTimeMillis())
                notice = when (added) {
                    0 -> "Nothing new: those files are already here."
                    1 -> "One song added."
                    else -> "$added songs added."
                }
            } catch (error: Exception) {
                songs = repository.load()
                notice = error.message ?: "The import did not finish."
            } finally {
                busy = false
            }
        }
    }

    // --- lyrics ------------------------------------------------------------

    /**
     * Asks for a lyric only when it is wanted and not recent. A song is looked at
     * again after fifteen minutes rather than on every visit, so the service is
     * asked once and a song without lyrics is not asked about again and again.
     */
    fun lookupLyrics(song: Song) {
        scope.launch {
            busy = true
            try {
                val raw = withContext(Dispatchers.IO) { client.find(song) }
                val latest = songs.find { it.id == song.id }
                if (latest != null && latest.lyrics.isEmpty() && raw.isNotEmpty()) {
                    update(latest.copy(lyrics = raw, checkedAt = System.currentTimeMillis()))
                } else {
                    latest?.let { update(it.copy(checkedAt = System.currentTimeMillis())) }
                }
                notice = if (raw.isEmpty()) "No lyrics found for this song." else ""
            } catch (error: Exception) {
                notice = error.message ?: "The lyrics lookup failed."
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
        const val KEY_LYRICS = "lyrics"
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
