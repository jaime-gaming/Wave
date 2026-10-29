package io.github.jaimegaming.wave

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.File

/**
 * The one player.
 *
 * Two [MediaPlayer]s, never one: the spare is armed with the next song while the
 * current one plays, which is what makes a blend possible at all — a player that
 * has to open a file first can only ever cut. Nothing about the audio is altered;
 * the blend is two files playing at once at changing levels.
 *
 * Position is published ten times a second because the bar only shows tenths of
 * a second, and at 33 ms while a blend is running because the ramps need it.
 */
class Player(private val context: Context) {
    var current by mutableStateOf<Song?>(null)
        private set
    var playing by mutableStateOf(false)
        private set
    var time by mutableStateOf(0.0)
        private set
    var duration by mutableStateOf(0.0)
        private set
    var message by mutableStateOf("")
        private set

    /** The queue, as it was started and as it has been reordered since. */
    var queue by mutableStateOf<List<Song>>(emptyList())
        private set
    var index by mutableStateOf(0)
        private set

    /**
     * Listeners for "what the outside world shows has changed".
     *
     * A list rather than one slot: the screen counts listening from the same
     * changes the notification redraws on, and neither may silence the other.
     */
    private val observers = mutableListOf<() -> Unit>()

    fun observe(observer: () -> Unit) {
        observers.add(observer)
    }

    fun stopObserving(observer: () -> Unit) {
        observers.remove(observer)
    }

    private fun changed() {
        observers.toList().forEach { it() }
    }

    var crossfade = 0.0
        set(value) {
            if (field == value) return
            field = value.coerceIn(0.0, BLEND_SECONDS)
            if (prepared && outgoing == null) prepareNext()
        }

    var volume = 1f
        set(value) {
            field = value.coerceIn(0f, 1f)
            if (outgoing == null && prepared) active?.setVolume(field, field)
        }

    private var active: MediaPlayer? = null
    private var prepared = false
    private var spare: MediaPlayer? = null
    private var spareReady = false
    private var outgoing: MediaPlayer? = null
    private var fadeLength = 0.0
    private val handler = Handler(Looper.getMainLooper())

    private val pulse = object : Runnable {
        override fun run() {
            try {
                step()
            } catch (error: Exception) {
                message = error.message ?: "Playback error"
            }
            handler.postDelayed(this, if (outgoing != null) 33 else 100)
        }
    }

    init {
        handler.post(pulse)
    }

    private fun step() {
        val player = active ?: return
        if (!prepared || !playing) return
        val position = player.currentPosition / 1000.0
        if (shouldPublishTime(time, position, outgoing != null)) time = position
        val tail = outgoing
        if (tail != null) {
            val progress = (time / fadeLength).coerceIn(0.0, 1.0)
            val gains = handoverGains(progress)
            tail.setVolume(gains.first * volume, gains.first * volume)
            player.setVolume(gains.second * volume, gains.second * volume)
            if (progress >= 1) {
                tail.release()
                outgoing = null
                prepareNext()
                changed()
            }
            return
        }
        if (crossfade > 0 && spareReady && index + 1 < queue.size) {
            val remaining = (player.duration - player.currentPosition) / 1000.0
            val next = spare ?: return
            val window = minOf(crossfade, player.duration / 2000.0)
            if (remaining <= 0 || remaining > window) return
            fadeLength = minOf(crossfade, remaining, next.duration / 2000.0)
            if (fadeLength <= .1) return
            outgoing = player
            active = next
            spare = null
            spareReady = false
            index++
            current = queue.getOrNull(index)
            duration = next.duration / 1000.0
            next.setVolume(0f, 0f)
            next.start()
            changed()
        }
    }

    private fun create(song: Song): MediaPlayer = MediaPlayer().also { player ->
        player.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
        if (song.path.startsWith("content://")) {
            player.setDataSource(context, Uri.parse(song.path))
        } else {
            player.setDataSource(song.path)
        }
        player.setOnCompletionListener { if (active === player) next() }
        player.setOnErrorListener { _, _, _ ->
            if (active === player) {
                message = "This file cannot be played."
                playing = false
                prepared = false
                changed()
            } else if (spare === player) {
                spareReady = false
            }
            true
        }
    }

    /** Arms the next song in silence so the blend has something to blend into. */
    private fun prepareNext() {
        spare?.release()
        spare = null
        spareReady = false
        if (crossfade <= 0 || index + 1 >= queue.size) return
        try {
            val next = create(queue[index + 1])
            spare = next
            next.setVolume(0f, 0f)
            next.setOnPreparedListener { if (spare === next) spareReady = true }
            next.prepareAsync()
        } catch (_: Exception) {
            spare?.release()
            spare = null
        }
    }

    fun play(songs: List<Song>, song: Song) {
        if (songs.isEmpty()) return
        cancelFade()
        releaseAll()
        queue = songs
        index = songs.indexOfFirst { it.id == song.id }.coerceAtLeast(0)
        current = songs[index]
        time = 0.0
        duration = songs[index].duration
        message = ""
        playing = false
        open(songs[index])
    }

    /** Plays this queue from the top, which is what a playlist header does. */
    fun play(songs: List<Song>) {
        songs.firstOrNull()?.let { play(songs, it) }
    }

    private fun open(song: Song) {
        try {
            val player = create(song)
            active = player
            player.setOnPreparedListener {
                if (active === player) {
                    prepared = true
                    duration = if (player.duration > 0) player.duration / 1000.0 else song.duration
                    player.setVolume(volume, volume)
                    player.start()
                    playing = true
                    prepareNext()
                    changed()
                }
            }
            player.prepareAsync()
        } catch (error: Exception) {
            message = error.message ?: "Cannot play this file."
            changed()
        }
    }

    private fun cancelFade() {
        outgoing?.release()
        outgoing = null
        if (prepared) active?.setVolume(volume, volume)
    }

    private fun releaseAll() {
        active?.release()
        active = null
        prepared = false
        spare?.release()
        spare = null
        spareReady = false
    }

    fun toggle() {
        if (!prepared) return
        try {
            cancelFade()
            if (playing) active?.pause() else active?.start()
            playing = !playing
            changed()
        } catch (_: Exception) {
            message = "Choose a playable file."
        }
    }

    fun pause() {
        if (prepared && playing) toggle()
    }

    fun resume() {
        if (prepared && !playing) toggle()
    }

    fun seek(seconds: Double) {
        if (!prepared) return
        cancelFade()
        val target = seconds.coerceIn(0.0, duration.coerceAtLeast(0.0))
        active?.seekTo((target * 1000).toInt())
        time = target
        changed()
    }

    fun next() {
        val following = queue.getOrNull(index + 1)
        if (following != null) {
            play(queue, following)
        } else {
            cancelFade()
            active?.pause()
            playing = false
            changed()
        }
    }

    fun previous() {
        if (time > 3) {
            seek(0.0)
        } else {
            val earlier = queue.getOrNull(index - 1)
            if (earlier != null) play(queue, earlier) else seek(0.0)
        }
    }

    /** Adds a song after the current one, which is what "play next" means. */
    fun enqueue(song: Song) {
        if (queue.any { it.id == song.id }) {
            message = "Already in the queue."
            return
        }
        val updated = queue.toMutableList().apply { add(index + 1, song) }
        queue = updated
        if (crossfade > 0) prepareNext()
        changed()
    }

    fun removeAt(position: Int) {
        if (position !in queue.indices || queue.size == 1) return
        val removedCurrent = position == index
        val updated = queue.filterIndexed { i, _ -> i != position }
        queue = updated
        if (removedCurrent) {
            play(updated, updated[position.coerceAtMost(updated.lastIndex)])
        } else if (position < index) {
            index--
            prepareNext()
            changed()
        } else {
            prepareNext()
            changed()
        }
    }

    /** Moves a song inside the queue, keeping whatever is playing playing. */
    fun reorder(from: Int, to: Int) {
        if (from !in queue.indices || to !in queue.indices || from == to) return
        val updated = queue.toMutableList()
        updated.add(to, updated.removeAt(from))
        val playing = current
        queue = updated
        index = playing?.let { updated.indexOfFirst { song -> song.id == it.id } }?.coerceAtLeast(0) ?: 0
        prepareNext()
        changed()
    }

    /** True when the file behind a song can still be opened. */
    fun isPlayable(song: Song): Boolean =
        if (song.path.startsWith("content://")) true else File(song.path).exists()

    fun dispose() {
        handler.removeCallbacks(pulse)
        playing = false
        prepared = false
        releaseAll()
    }
}
