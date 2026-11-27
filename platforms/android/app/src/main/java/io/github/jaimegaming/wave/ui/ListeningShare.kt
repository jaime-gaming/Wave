package io.github.jaimegaming.wave.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextUtils
import androidx.core.content.FileProvider
import io.github.jaimegaming.wave.Song
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext


internal suspend fun shareListening(context: Context, song: Song, artwork: Bitmap?) {
    val uri = withContext(Dispatchers.IO) {
    val directory = File(context.cacheDir, "listening-cards").apply { mkdirs() }

    directory.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 60 * 60 * 1000L }?.forEach { it.delete() }
    val file = File(directory, "wave-${UUID.randomUUID()}.png")
    val bitmap = Bitmap.createBitmap(1080, 1350, Bitmap.Config.ARGB_8888)
    try {
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(15, 18, 28))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val art = RectF(115f, 190f, 965f, 1040f)
        canvas.save()
        val path = android.graphics.Path().apply { addRoundRect(art, 46f, 46f, android.graphics.Path.Direction.CW) }
        canvas.clipPath(path)
        if (artwork != null && artwork.width > 0 && artwork.height > 0) {
            val scale = maxOf(art.width() / artwork.width, art.height() / artwork.height)
            val width = artwork.width * scale
            val height = artwork.height * scale
            canvas.drawBitmap(artwork, null, RectF(art.centerX() - width / 2, art.centerY() - height / 2, art.centerX() + width / 2, art.centerY() + height / 2), paint)
        } else {
            paint.color = Color.rgb(38, 48, 74)
            canvas.drawRect(art, paint)
            paint.color = Color.WHITE
            paint.textSize = 260f
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText("♪", 540f, 715f, paint)
        }
        canvas.restore()
        paint.textAlign = Paint.Align.LEFT
        fun text(value: String, x: Float, y: Float, size: Float, color: Int, bold: Boolean) {
            paint.textSize = size
            paint.color = color
            paint.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            canvas.drawText(TextUtils.ellipsize(value, android.text.TextPaint(paint), 850f, TextUtils.TruncateAt.END).toString(), x, y, paint)
        }
        text("WAVE", 115f, 125f, 50f, Color.WHITE, true)
        text(song.title, 115f, 1150f, 62f, Color.WHITE, true)
        text(song.artist, 115f, 1220f, 42f, Color.LTGRAY, false)
        text("wave.jaime-gaming.com", 115f, 1320f, 30f, Color.rgb(166, 199, 255), true)
        file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
    } finally {
        bitmap.recycle()
    }
    FileProvider.getUriForFile(context, "${context.packageName}.listening-cards", file)
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, "https://wave.jaime-gaming.com")
        clipData = android.content.ClipData.newRawUri("Wave", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, Loc.t("Share song")))
}
