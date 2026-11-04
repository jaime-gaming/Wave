package io.github.jaimegaming.wave.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.jaimegaming.wave.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Song covers.
 *
 * The sleeve is inside the file, so it is read from the file and never copied,
 * re-encoded or uploaded. Decoding happens off the main thread and a small cache
 * keeps a scroll from decoding the same sleeve twice. A file without artwork
 * gets the same music-note placeholder as the mobile website.
 */
private val artworkCache = object : LruCache<String, Bitmap>(24 * 1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount / 1024
}

private fun embedded(context: Context, path: String, maxSide: Int): Bitmap? {
    val cacheKey = "$path|$maxSide"
    artworkCache.get(cacheKey)?.let { return it }
    val retriever = MediaMetadataRetriever()
    return try {
        if (path.startsWith("content://")) retriever.setDataSource(context, Uri.parse(path))
        else retriever.setDataSource(path)
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
        artworkCache.put(cacheKey, bitmap)
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
    val context = LocalContext.current.applicationContext
    val requestKey = "${song.path}|$maxSide"
    val state = produceState<Pair<String, Bitmap?>?>(initialValue = null, requestKey) {
        val bitmap = withContext(Dispatchers.IO) { embedded(context, song.path, maxSide) }
        value = requestKey to bitmap
    }
    // produceState retains its previous value while a new request starts. Never
    // show the preceding song's sleeve for the new song during that interval.
    return state.value?.takeIf { it.first == requestKey }?.second
}

@Composable
fun Cover(song: Song, size: Dp, radius: Dp = 12.dp) {
    val bitmap = rememberArtwork(song)
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(radius))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh),
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
            WaveIcon("song", size = size * 0.38f, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
