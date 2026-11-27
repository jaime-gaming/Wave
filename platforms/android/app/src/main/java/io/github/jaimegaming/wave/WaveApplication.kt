package io.github.jaimegaming.wave

import android.app.Application
import io.github.jaimegaming.wave.ui.Loc










class WaveApplication : Application() {
    lateinit var library: Library
        private set
    lateinit var player: Player
        private set

    override fun onCreate() {
        super.onCreate()


        Loc.init(this)
        library = Library(this)
        player = Player(this)
        player.volume = preferences().getInt("volume", 100) / 100f
    }

    fun preferences() = getSharedPreferences("wave", MODE_PRIVATE)

    private fun saveVolume() {
        preferences().edit().putInt("volume", (player.volume * 100).toInt()).apply()
    }
}


val android.content.Context.wave: WaveApplication
    get() = applicationContext as WaveApplication
