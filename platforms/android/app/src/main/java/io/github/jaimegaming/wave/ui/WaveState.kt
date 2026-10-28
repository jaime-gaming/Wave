package io.github.jaimegaming.wave.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.github.jaimegaming.wave.BLEND_SECONDS
import io.github.jaimegaming.wave.Library
import io.github.jaimegaming.wave.LyricsClient
import io.github.jaimegaming.wave.Player
import io.github.jaimegaming.wave.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The three places a phone-sized Wave can be. */
enum class Destination(val label: String) {
    Home("Home"),
    Library("Library"),
    Settings("Settings"),
}

/**
 * Everything the screens read and write, kept in one place.
 *
 * The screens themselves are pure: they receive this and draw. That keeps the
 * library, the player and the network work out of the layout, and it means the
 * screens themselves stay short enough to read in one sitting.
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
    var destination by mutableStateOf(Destination.Home)
    var query by mutableStateOf("")
    var nowPlayingOpen by mutableStateOf(false)
    var lyricsOpen by mutableStateOf(true)
    var busy by mutableStateOf(false)
        private set
    var notice by mutableStateOf("")
    var editing by mutableStateOf<Song?>(null)
    var mixEnabled by mutableStateOf(preferences().getBoolean(KEY_MIX, true))
        private set
    var onlineLyrics by mutableStateOf(preferences().getBoolean(KEY_LYRICS, false))
        private set
    /** Library work and lookups run here, never on the frame that draws a row. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    init {
        player.crossfade = if (mixEnabled) BLEND_SECONDS else 0.0
    }

    private fun preferences() = context.getSharedPreferences("wave", Context.MODE_PRIVATE)

    fun setMix(enabled: Boolean) {
        mixEnabled = enabled
        player.crossfade = if (enabled) BLEND_SECONDS else 0.0
        preferences().edit().putBoolean(KEY_MIX, enabled).apply()
    }

    fun setOnlineLyrics(enabled: Boolean) {
        onlineLyrics = enabled
        preferences().edit().putBoolean(KEY_LYRICS, enabled).apply()
    }

    /** Visible songs for the current search, in library order. */
    fun visible(): List<Song> {
        val needle = query.trim()
        if (needle.isEmpty()) return songs
        return songs.filter {
            it.title.contains(needle, true) ||
                it.artist.contains(needle, true) ||
                it.album.contains(needle, true)
        }
    }

    fun update(song: Song) {
        val updated = songs.map { if (it.id == song.id) song else it }
        repository.save(updated)
        songs = updated
    }

    fun toggleFavorite(song: Song) = update(song.copy(favorite = !song.favorite))

    fun play(song: Song) {
        val queue = visible()
        player.play(if (queue.any { it.id == song.id }) queue else songs, song)
    }

    fun importMusic(uris: List<android.net.Uri>) {
        if (uris.isEmpty()) return
        scope.launch {
            busy = true
            try {
                val added = withContext(Dispatchers.IO) { repository.importFiles(uris) }
                songs = repository.load()
                notice = when (added) {
                    0 -> "Nothing new: those files are already here."
                    1 -> "1 track added."
                    else -> "$added tracks added."
                }
            } catch (error: Exception) {
                songs = repository.load()
                notice = error.message ?: "Import failed."
            } finally {
                busy = false
            }
        }
    }

    /**
     * Looks a lyric up only when it is wanted and stale. A song is re-checked
     * after fifteen minutes rather than on every visit, so the app stays quiet
     * towards the lyric service and the listener is never spammed with retries.
     */
    fun lookupLyrics(song: Song) {
        scope.launch {
            busy = true
            try {
                val raw = withContext(Dispatchers.IO) { client.find(song) }
                val latest = songs.find { it.id == song.id }
                val unchanged = latest != null &&
                    latest.title == song.title &&
                    latest.artist == song.artist &&
                    latest.lyrics.isEmpty()
                if (unchanged && latest != null) {
                    update(latest.copy(lyrics = raw, checkedAt = System.currentTimeMillis()))
                }
                notice = if (raw.isEmpty()) "No matching lyrics." else ""
            } catch (error: Exception) {
                notice = error.message ?: "Lyrics lookup failed."
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
        scope.cancel()
        player.dispose()
    }

    private companion object {
        const val KEY_MIX = "mix"
        const val KEY_LYRICS = "lyrics"
        const val LYRIC_COOLDOWN = 15 * 60 * 1000L
    }
}

@Composable
fun rememberWaveState(context: Context): WaveState {
    val repository = remember { Library(context.applicationContext) }
    val player = remember { Player() }
    val client = remember { LyricsClient() }
    return remember { WaveState(context.applicationContext, repository, player, client) }
}
