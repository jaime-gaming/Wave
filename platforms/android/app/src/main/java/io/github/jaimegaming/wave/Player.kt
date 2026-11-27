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


    var queue by mutableStateOf<List<Song>>(emptyList())
        private set
    var index by mutableStateOf(0)
        private set

    var playbackSerial: Long = 0
        private set







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

    private var focusGain = 1f
    private val outputGain: Float get() = outputVolume * focusGain
    private var beforeMute = 1f
    private var outputVolume by mutableStateOf(1f)
    var volume: Float
        get() = outputVolume
        set(value) {
            if (!value.isFinite()) return
            if (value <= 0f && outputVolume > 0f) beforeMute = outputVolume
            outputVolume = value.coerceIn(0f, 1f)
            if (outgoing == null && prepared) active?.setVolume(outputGain, outputGain)
            changed()
        }


    fun setDucked(ducked: Boolean) {
        focusGain = if (ducked) .3f else 1f
        if (outgoing == null && prepared) active?.setVolume(outputGain, outputGain)
    }

    fun toggleMute() {
        volume = if (volume > 0f) 0f else beforeMute.coerceIn(0.01f, 1f)
    }

    private var active: MediaPlayer? = null
    private var prepared = false
    private var spare: MediaPlayer? = null
    private var spareReady = false
    private var outgoing: MediaPlayer? = null
    private var fadeLength = 0.0
    private var fadeEnding = EndingShape.FADE

    private var fadeCue = 0.0
    private val handler = Handler(Looper.getMainLooper())

    private var released = false
    private var pulseScheduled = false

    private val pulse = object : Runnable {
        override fun run() {
            pulseScheduled = false
            try {
                step()
            } catch (error: Exception) {
                message = error.message ?: "Playback error"
            }


            if (!released && (playing || outgoing != null)) schedulePulse()
        }
    }

    private fun schedulePulse() {
        if (released || pulseScheduled) return
        pulseScheduled = true
        handler.postDelayed(pulse, if (outgoing != null) 33L else 100L)
    }

    init {
        schedulePulse()
    }


    var onQueueEnded: (() -> Song?)? = null

    private fun step() {
        val player = active ?: return
        if (!prepared || !playing) return
        val currentMs = runCatching { player.currentPosition }.getOrNull() ?: return
        val position = currentMs / 1000.0
        if (shouldPublishTime(time, position, outgoing != null)) time = position
        val tail = outgoing
        if (tail != null) {
            val progress = ((time - fadeCue) / fadeLength).coerceIn(0.0, 1.0)
            val gains = endingGains(progress, fadeEnding)
            runCatching {
                tail.setVolume(gains.first * outputGain, gains.first * outputGain)
                player.setVolume(gains.second * outputGain, gains.second * outputGain)
            }
            if (progress >= endingCut(fadeEnding)) {
                runCatching { tail.release() }
                player.setVolume(outputGain, outputGain)
                outgoing = null
                fadeCue = 0.0
                prepareNext()
                changed()
            }
            return
        }
        if (crossfade > 0 && spareReady && index + 1 < queue.size) {
            val totalMs = runCatching { player.duration }.getOrNull() ?: return
            val remaining = (totalMs - currentMs) / 1000.0
            val next = spare ?: return
            val nextMs = runCatching { next.duration }.getOrNull() ?: return
            val outgoingSong = current ?: return
            fadeEnding = detectEnding(outgoingSong)

            val window = minOf(
                crossfade,
                automaticBlendSeconds(totalMs / 1000.0, nextMs / 1000.0),
                nextMs / 1000.0,
            )
            if (remaining <= 0 || remaining > window) return
            fadeLength = remaining
            fadeCue = 0.0
            if (fadeLength <= .1) return
            next.setVolume(0f, 0f)
            if (runCatching { next.start() }.isFailure) {
                runCatching { next.release() }
                spare = null
                spareReady = false
                return
            }
            outgoing = player
            active = next
            spare = null
            spareReady = false
            index++
            current = queue.getOrNull(index)
            playbackSerial++
            duration = nextMs / 1000.0
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
        playbackSerial++
        time = 0.0
        duration = songs[index].duration
        message = ""
        playing = false
        open(songs[index])
    }


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
                    player.setVolume(outputGain, outputGain)
                    player.start()
                    playing = true
                    schedulePulse()
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
        fadeCue = 0.0
        fadeEnding = EndingShape.FADE
        if (prepared) active?.setVolume(outputGain, outputGain)
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
            if (playing) schedulePulse()
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
            val auto = onQueueEnded?.invoke()
            if (auto != null && isPlayable(auto)) {
                val extended = queue.filterNot { it.id == auto.id } + auto
                play(extended, auto)
            } else {
                cancelFade()
                active?.pause()
                playing = false
                changed()
            }
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


    fun shuffleUpcoming() {
        if (index !in queue.indices) return
        cancelFade()
        queue = queue.take(index + 1) + queue.drop(index + 1).shuffled()
        prepareNext()
        changed()
    }


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


    fun isPlayable(song: Song): Boolean =
        if (song.path.startsWith("content://")) {
            runCatching {
                context.contentResolver.openAssetFileDescriptor(Uri.parse(song.path), "r")?.use { true } ?: false
            }.getOrDefault(false)
        } else {
            File(song.path).exists()
        }

    fun dispose() {
        released = true
        pulseScheduled = false
        handler.removeCallbacks(pulse)
        playing = false
        prepared = false
        releaseAll()
    }
}
