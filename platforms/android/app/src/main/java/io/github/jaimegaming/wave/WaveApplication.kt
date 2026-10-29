package io.github.jaimegaming.wave

import android.app.Application

/**
 * One library and one player for the whole process.
 *
 * The interface and the playback service are two windows onto the same objects:
 * the notification shows the song the screen is showing, and a tap in either
 * place moves the same queue. Creating them here is what makes that true; a
 * player owned by an Activity would die with a rotation and a library owned by a
 * screen would be read four times for four tabs.
 */
class WaveApplication : Application() {
    lateinit var library: Library
        private set
    lateinit var player: Player
        private set

    override fun onCreate() {
        super.onCreate()
        library = Library(this)
        player = Player(this)
        player.volume = preferences().getInt("volume", 100) / 100f
    }

    fun preferences() = getSharedPreferences("wave", MODE_PRIVATE)

    private fun saveVolume() {
        preferences().edit().putInt("volume", (player.volume * 100).toInt()).apply()
    }
}

/** The running application, typed. */
val android.content.Context.wave: WaveApplication
    get() = applicationContext as WaveApplication
