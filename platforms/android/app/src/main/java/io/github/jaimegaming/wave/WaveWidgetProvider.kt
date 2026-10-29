package io.github.jaimegaming.wave

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * The home-screen widget: what is playing, and one button.
 *
 * A widget is drawn by another process, so it cannot read the live player — it is
 * rebuilt from the library's saved state whenever the player changes. That is why
 * the widget is honest about being a snapshot: the title is right, and the button
 * is a real button.
 */
class WaveWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, build(context))
    }

    companion object {
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                android.content.ComponentName(context, WaveWidgetProvider::class.java),
            )
            for (id in ids) manager.updateAppWidget(id, build(context))
        }

        private fun build(context: Context): RemoteViews {
            val app = context.applicationContext as WaveApplication
            val player = app.player
            val song = player.current
            val views = RemoteViews(context.packageName, R.layout.wave_widget)
            views.setTextViewText(R.id.widget_title, song?.title ?: context.getString(R.string.widget_idle))
            views.setTextViewText(R.id.widget_artist, song?.artist.orEmpty())
            views.setTextViewText(R.id.widget_toggle, if (player.playing) "⏸" else "▶")
            val open = PendingIntent.getActivity(
                context,
                10,
                Intent(context, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_OPEN_PLAYER, song != null)
                    .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_title, open)
            views.setOnClickPendingIntent(
                R.id.widget_toggle,
                PendingIntent.getBroadcast(
                    context,
                    11,
                    Intent(context, PlaybackActionReceiver::class.java)
                        .setAction(PlaybackService.ACTION_TOGGLE),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            return views
        }
    }
}
