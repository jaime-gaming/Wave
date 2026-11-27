package io.github.jaimegaming.wave

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.widget.RemoteViews






class WaveWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val views = build(context)
        for (id in ids) manager.updateAppWidget(id, views)
    }

    companion object {
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, WaveWidgetProvider::class.java),
            )
            if (ids.isEmpty()) return
            val views = build(context)
            for (id in ids) manager.updateAppWidget(id, views)
        }

        private fun build(context: Context): RemoteViews {
            val app = context.applicationContext as WaveApplication
            val player = app.player
            val song = player.current
            val views = RemoteViews(context.packageName, R.layout.wave_widget)

            views.setTextViewText(R.id.widget_title, song?.title ?: context.getString(R.string.widget_idle))
            val subtitle = when {
                song == null -> context.getString(R.string.app_name)
                song.album.isNotBlank() && song.album != "Unknown album" -> "${song.artist} · ${song.album}"
                else -> song.artist
            }
            views.setTextViewText(R.id.widget_artist, subtitle)
            views.setImageViewResource(
                R.id.widget_toggle,
                if (player.playing) R.drawable.ic_widget_pause else R.drawable.ic_widget_play,
            )

            val art = song?.let { decodeRoundedArtwork(context, it.path, 160) }
            if (art != null) {
                views.setViewPadding(R.id.widget_art, 0, 0, 0, 0)
                views.setImageViewBitmap(R.id.widget_art, art)
            } else {
                val pad = (10 * context.resources.displayMetrics.density).toInt()
                views.setViewPadding(R.id.widget_art, pad, pad, pad, pad)
                views.setImageViewResource(R.id.widget_art, R.drawable.wave_mark)
            }

            val open = PendingIntent.getActivity(
                context,
                10,
                Intent(context, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_OPEN_PLAYER, song != null)
                    .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_art, open)
            views.setOnClickPendingIntent(R.id.widget_meta, open)
            views.setOnClickPendingIntent(R.id.widget_toggle, actionIntent(context, 11, PlaybackService.ACTION_TOGGLE))
            views.setOnClickPendingIntent(R.id.widget_prev, actionIntent(context, 12, PlaybackService.ACTION_PREVIOUS))
            views.setOnClickPendingIntent(R.id.widget_next, actionIntent(context, 13, PlaybackService.ACTION_NEXT))
            return views
        }

        private fun actionIntent(context: Context, code: Int, action: String): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                code,
                Intent(context, PlaybackActionReceiver::class.java).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        private fun decodeRoundedArtwork(context: Context, path: String, targetPx: Int): Bitmap? {
            if (path.isBlank()) return null
            val retriever = MediaMetadataRetriever()
            return try {
                if (path.startsWith("content://")) retriever.setDataSource(context, Uri.parse(path))
                else retriever.setDataSource(path)
                val bytes = retriever.embeddedPicture ?: return null
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                var sample = 1
                while (bounds.outWidth / sample > targetPx * 2 && bounds.outHeight / sample > targetPx * 2) {
                    sample *= 2
                }
                val raw = BitmapFactory.decodeByteArray(
                    bytes,
                    0,
                    bytes.size,
                    BitmapFactory.Options().apply { inSampleSize = sample },
                ) ?: return null
                val scaled = Bitmap.createScaledBitmap(raw, targetPx, targetPx, true)
                if (scaled !== raw) raw.recycle()
                roundCorners(scaled, targetPx * 0.22f)
            } catch (_: Exception) {
                null
            } finally {
                runCatching { retriever.release() }
            }
        }

        private fun roundCorners(source: Bitmap, radius: Float): Bitmap {
            val out = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(out)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val rect = Rect(0, 0, source.width, source.height)
            canvas.drawRoundRect(RectF(rect), radius, radius, paint)
            paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            canvas.drawBitmap(source, rect, rect, paint)
            source.recycle()
            return out
        }
    }
}
