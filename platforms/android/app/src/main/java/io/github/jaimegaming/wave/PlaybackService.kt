package io.github.jaimegaming.wave

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import androidx.media.MediaMetadataCompat
import androidx.media.session.MediaSessionCompat
import androidx.media.session.PlaybackStateCompat

/**
 * Music that keeps playing when the screen goes off.
 *
 * Android expects a playing app to be a foreground service with a media session:
 * that single thing is what puts the song on the lock screen, in the shade, on a
 * watch face and in a car, and what lets a pair of headphones pause it. Without
 * it the app is a sound that stops the moment another app wants the speaker.
 *
 * The session is also the audio focus holder. A call, a video or a navigation
 * prompt takes the focus away, the music pauses, and it comes back when the
 * interruption ends unless the listener paused it themselves — which is the
 * behaviour people expect and the one Android's own players have.
 */
class PlaybackService : Service() {
    private lateinit var session: MediaSessionCompat
    private lateinit var manager: NotificationManager
    private lateinit var audio: AudioManager
    private var focus: AudioFocusRequest? = null
    private var player: Player? = null
    private var noisy = false
    /** True while the pause was caused by something other than the listener. */
    private var ducked = false

    private val becomingNoisy = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // Headphones out: stop. Android's own players all do this.
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) player?.pause()
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        val player = player ?: return@OnAudioFocusChangeListener
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                ducked = true
                player.pause()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                ducked = true
                player.pause()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                player.volume = player.volume * 0.3f
                ducked = true
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                if (ducked) {
                    ducked = false
                    player.volume = 1f
                    player.toggle()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        player = (application as WaveApplication).player
        manager = getSystemService(NotificationManager::class.java)
        audio = getSystemService(AudioManager::class.java)
        createChannel()
        session = MediaSessionCompat(this, "Wave").apply {
            setCallback(callback)
            isActive = true
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS,
            )
        }
        registerReceiver(becomingNoisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
        noisy = true
        player?.observe(publisher)
        publish()
    }

    /** Every change the player makes redraws the notification and saves the volume. */
    private val publisher: () -> Unit = {
        publish()
        val app = application as WaveApplication
        app.preferences().edit().putInt("volume", (app.player.volume * 100).toInt()).apply()
    }

    private val callback = object : MediaSessionCompat.Callback() {
        override fun onPlay() = player?.let { if (!it.playing) it.toggle() } ?: Unit
        override fun onPause() = player?.let { if (it.playing) it.toggle() } ?: Unit
        override fun onSkipToNext() { player?.next() }
        override fun onSkipToPrevious() { player?.previous() }
        override fun onSeekTo(pos: Long) { player?.seek(pos / 1000.0) }
        override fun onStop() {
            player?.pause()
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> player?.toggle()
            ACTION_NEXT -> player?.next()
            ACTION_PREVIOUS -> player?.previous()
            else -> MediaButtonReceiver.handleIntent(session, intent)
        }
        if (player?.current != null) startForegroundNow()
        return START_STICKY
    }

    private fun startForegroundNow() {
        val notification = build()
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            } else {
                0
            },
        )
    }

    /** Keeps the notification, the session metadata and the foreground state in step. */
    private fun publish() {
        val player = player ?: return
        val song = player.current
        if (song == null) {
            stopSelf()
            return
        }
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, song.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, song.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, song.album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (player.duration * 1000).toLong())
                .build(),
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
                        PlaybackStateCompat.ACTION_STOP,
                )
                .setState(
                    if (player.playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    (player.time * 1000).toLong(),
                    if (player.playing) 1f else 0f,
                )
                .build(),
        )
        if (player.playing) {
            requestFocus()
            startForegroundNow()
        } else {
            manager.notify(NOTIFICATION_ID, build())
        }
    }

    private fun build(): Notification {
        val player = player
        val song = player?.current
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_OPEN_PLAYER, true)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // The three buttons are ordinary broadcasts: they work even if Android
        // has just recreated the process to deliver one.
        fun action(code: Int, name: String): PendingIntent = PendingIntent.getBroadcast(
            this,
            code,
            Intent(this, PlaybackActionReceiver::class.java).setAction(name),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val toggle = action(1, ACTION_TOGGLE)
        val next = action(2, ACTION_NEXT)
        val previous = action(3, ACTION_PREVIOUS)
        val body = listOfNotNull(song?.artist?.takeIf { it.isNotBlank() }, song?.album?.takeIf { it.isNotBlank() })
            .joinToString(" · ")
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.wave_mark)
            .setContentTitle(song?.title ?: "Wave")
            .setContentText(body)
            .setContentIntent(open)
            .setOngoing(player?.playing == true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(
                R.drawable.wave_mark,
                "Previous",
                previous,
            )
            .addAction(
                R.drawable.wave_mark,
                if (player?.playing == true) "Pause" else "Play",
                toggle,
            )
            .addAction(R.drawable.wave_mark, "Next", next)
            .setStyle(
                MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .build()
    }

    private fun requestFocus() {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setOnAudioFocusChangeListener(focusListener)
            .setWillPauseWhenDucked(false)
            .build()
        focus = request
        audio.requestAudioFocus(request)
    }

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
            description = "The song that is playing"
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        if (noisy) runCatching { unregisterReceiver(becomingNoisy) }
        noisy = false
        focus?.let { audio.abandonAudioFocusRequest(it) }
        session.isActive = false
        session.release()
        player?.stopObserving(publisher)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL = "wave-playback"
        const val NOTIFICATION_ID = 41
        const val ACTION_TOGGLE = "io.github.jaimegaming.wave.TOGGLE"
        const val ACTION_NEXT = "io.github.jaimegaming.wave.NEXT"
        const val ACTION_PREVIOUS = "io.github.jaimegaming.wave.PREVIOUS"

        /**
         * Starts the service, or tells it to refresh its notification.
         *
         * A foreground service has to show a notification, so with nothing playing
         * there is nothing to start: the caller is asking for a refresh, not for a
         * service that would have to stop itself at once.
         */
        fun refresh(context: Context) {
            val player = (context.applicationContext as WaveApplication).player
            if (player.current == null) return
            val intent = Intent(context, PlaybackService::class.java)
            runCatching { context.startForegroundService(intent) }
                .onFailure { runCatching { context.startService(intent) } }
            WaveWidgetProvider.refresh(context)
        }
    }
}

/**
 * The three notification buttons, which the system sends as plain intents.
 *
 * They are handled here rather than in the service so a button still works while
 * the service is being created, which is the case right after a reboot or after
 * Android has reclaimed the process.
 */
class PlaybackActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val player = (context.applicationContext as WaveApplication).player
        when (intent.action) {
            PlaybackService.ACTION_TOGGLE -> player.toggle()
            PlaybackService.ACTION_NEXT -> player.next()
            PlaybackService.ACTION_PREVIOUS -> player.previous()
        }
        PlaybackService.refresh(context)
    }
}
