package io.github.jaimegaming.wave

import android.annotation.SuppressLint
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService







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



    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val player = (application as WaveApplication).player
        if (player.current == null) {

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
