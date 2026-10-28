package io.github.jaimegaming.wave.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Song covers.
 *
 * The sleeve is inside the file, so it is read from the file and never copied,
 * re-encoded or uploaded. Decoding happens off the main thread and a small cache
 * keeps a scroll from decoding the same sleeve twice. A file without artwork —
 * which is most of a downloaded library — gets a tile drawn from its own palette
 * instead of a grey box.
 */
private val artworkCache = object : LruCache<String, Bitmap>(24) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount / 1024
}

private fun embedded(path: String, maxSide: Int): Bitmap? {
    artworkCache.get(path)?.let { return it }
    val retriever = MediaMetadataRetriever()
    return try {
        retriever.setDataSource(path)
        val bytes = retriever.embeddedPicture ?: return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxSide) sample *= 2
        val bitmap = BitmapFactory.decodeByteArray(
            bytes,
            0,
            bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: return null
        artworkCache.put(path, bitmap)
        bitmap
    } catch (_: Exception) {
        null
    } finally {
        try {
            retriever.release()
        } catch (_: Exception) {
            // Nothing to release.
        }
    }
}

@Composable
fun rememberArtwork(song: Song, maxSide: Int = 512): Bitmap? {
    val state = produceState<Bitmap?>(initialValue = null, song.path) {
        value = withContext(Dispatchers.IO) { embedded(song.path, maxSide) }
    }
    return state.value
}

@Composable
fun Cover(song: Song, size: Dp, radius: Dp = 12.dp) {
    val bitmap = rememberArtwork(song)
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(radius))
            .background(tileBrush(song.id)),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = song.title.take(1).uppercase(),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = (size.value / 3).sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** Two linked tones from the song's own accent; stable, so rows never flicker. */
fun tileBrush(id: String): Brush {
    val accent = accentFor(id)
    return Brush.linearGradient(
        colors = listOf(
            accent.copy(alpha = 0.55f),
            accent.copy(alpha = 0.18f),
        ),
    )
}
