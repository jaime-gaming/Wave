package io.github.jaimegaming.wave

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

class Player {
    var current by mutableStateOf<Song?>(null)
        private set
    var playing by mutableStateOf(false)
        private set
    var time by mutableStateOf(0.0)
        private set
    var message by mutableStateOf("")
        private set
    var crossfade = 0.0
        set(value) {
            if (field == value) return
            field = value.coerceIn(0.0, 12.0)
            if (prepared && outgoing == null) prepareNext()
        }
    var volume = 1f
    private var queue = emptyList<Song>()
    private var position = 0
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
                val player = active
                if (player != null && playing && prepared) {
                    time = player.currentPosition / 1000.0
                    val tail = outgoing
                    if (tail != null) {
                        val progress = (time / fadeLength).coerceIn(0.0, 1.0)
                        val gains = powerGains(progress)
                        tail.setVolume(gains.first * volume, gains.first * volume)
                        player.setVolume(gains.second * volume, gains.second * volume)
                        if (progress >= 1) {
                            tail.release()
                            outgoing = null
                            prepareNext()
                        }
                    } else if (crossfade > 0 && spareReady && position + 1 < queue.size) {
                        val remaining = (player.duration - player.currentPosition) / 1000.0
                        if (remaining > 0 && remaining <= crossfade.coerceAtMost(player.duration / 2000.0)) {
                            val next = spare!!
                            fadeLength = minOf(crossfade, remaining, next.duration / 2000.0)
                            if (fadeLength > .1) {
                                outgoing = player
                                active = next
                                spare = null
                                spareReady = false
                                position++
                                current = queue[position]
                                next.setVolume(0f, 0f)
                                next.start()
                            }
                        }
                    }
                }
            } catch (error: Exception) {
                message = error.message ?: "Playback error"
            }
            handler.postDelayed(this, 33)
        }
    }
    init {
        handler.post(pulse)
    }
    private fun create(song: Song): MediaPlayer = MediaPlayer().also { player ->
        player.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
        player.setDataSource(song.path)
        player.setOnCompletionListener { if (active === player) next() }
        player.setOnErrorListener { _, _, _ ->
            if (active === player) {
                message = "This codec cannot be played."
                playing = false
                prepared = false
            } else if (spare === player) {
                spareReady = false
            }
            true
        }
    }
    private fun prepareNext() {
        spare?.release()
        spare = null
        spareReady = false
        if (crossfade <= 0 || position + 1 >= queue.size) return
        try {
            val next = create(queue[position + 1])
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
        cancelFade()
        active?.release()
        active = null
        prepared = false
        spare?.release()
        spare = null
        spareReady = false
        queue = songs
        position = songs.indexOfFirst { it.id == song.id }.coerceAtLeast(0)
        current = song
        time = 0.0
        message = ""
        playing = false
        try {
            val player = create(song)
            active = player
            player.setOnPreparedListener {
                if (active === player) {
                    prepared = true
                    player.setVolume(volume, volume)
                    player.start()
                    playing = true
                    prepareNext()
                }
            }
            player.prepareAsync()
        } catch (error: Exception) {
            message = error.message ?: "Cannot play this file"
        }
    }
    private fun cancelFade() {
        outgoing?.release()
        outgoing = null
        if (prepared) active?.setVolume(volume, volume)
    }
    fun toggle() {
        if (!prepared) return
        try {
            cancelFade()
            if (playing) active?.pause() else active?.start()
            playing = !playing
        } catch (_: Exception) {
            message = "Choose a playable file."
        }
    }
    fun seek(seconds: Double) {
        if (!prepared) return
        cancelFade()
        active?.seekTo((seconds * 1000).toInt())
        time = seconds
    }
    fun next() {
        if (position + 1 < queue.size) play(queue, queue[position + 1])
        else {
            if (prepared && playing) active?.pause()
            playing = false
            cancelFade()
        }
    }
    fun previous() {
        if (time > 3) seek(0.0) else if (position > 0) play(queue, queue[position - 1])
    }
    fun dispose() {
        handler.removeCallbacks(pulse)
        playing = false
        prepared = false
        val old = active
        active = null
        old?.release()
        spare?.release()
        spare = null
        outgoing?.release()
        outgoing = null
    }
}
