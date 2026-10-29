package io.github.jaimegaming.wave

import android.annotation.SuppressLint
import android.service.quicksettings.Tile
import android.annotation.SuppressLint
import android.service.quicksettings.TileService

/**
 * Play or pause from the quick settings panel.
 *
 * The same button the notification has, in the one place a phone can reach
 * without unlocking it.
 */
class WaveTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val player = (application as WaveApplication).player
        qsTile?.apply {
            state = if (player.playing) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            label = player.current?.title ?: "Wave"
            updateTile()
        }
    }

    // The PendingIntent form of startActivityAndCollapse arrived in Android 14; the
    // Intent form is the only way to open the app from a tile before that.
    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val player = (application as WaveApplication).player
        if (player.current == null) {
            // Nothing has been played yet: open the app instead of doing nothing.
            val intent = android.content.Intent(this, MainActivity::class.java)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivityAndCollapse(
                    android.app.PendingIntent.getActivity(
                        this,
                        0,
                        intent,
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                            android.app.PendingIntent.FLAG_IMMUTABLE,
                    ),
                )
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(intent)
            }
            return
        }
        player.toggle()
        PlaybackService.refresh(this)
        onStartListening()
    }
}
