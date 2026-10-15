package io.github.jaimegaming.wave

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

data class Song(val id: String, val title: String, val artist: String, val album: String, val filename: String, val path: String, val duration: Double = 0.0, val favorite: Boolean = false, val lyrics: String = "", val checkedAt: Long = 0)
class Library(private val context: Context) {
    private val index = AtomicFile(File(context.filesDir, "library.json"))
    private val audio = File(context.filesDir, "audio").apply { mkdirs() }
    @Synchronized fun load(): List<Song> {
        if (!index.baseFile.exists()) return emptyList()
        val values = JSONArray(index.openRead().bufferedReader().use { it.readText() })
        return (0 until values.length()).map { i -> val o = values.getJSONObject(i); Song(o.getString("id"),o.getString("title"),o.getString("artist"),o.getString("album"),o.getString("filename"),o.getString("path"),o.optDouble("duration",0.0),o.optBoolean("favorite"),o.optString("lyrics"),o.optLong("checkedAt")) }
    }
    @Synchronized fun save(songs: List<Song>) {
        val array = JSONArray()
        songs.forEach { s -> array.put(JSONObject().put("id",s.id).put("title",s.title).put("artist",s.artist).put("album",s.album).put("filename",s.filename).put("path",s.path).put("duration",s.duration).put("favorite",s.favorite).put("lyrics",s.lyrics).put("checkedAt",s.checkedAt)) }
        val stream = index.startWrite()
        try { stream.write(array.toString().toByteArray()); index.finishWrite(stream) } catch (error: Exception) { index.failWrite(stream); throw error }
    }
    @Synchronized fun importFiles(uris: List<Uri>): Int {
        val songs = load().toMutableList(); var added = 0
        for (uri in uris) {
            val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { cursor -> if(cursor.moveToFirst()) cursor.getString(0) else "Audio" } ?: "Audio"
            val temp = File.createTempFile("import-", ".tmp", audio)
            try {
                val digest = MessageDigest.getInstance("SHA-256"); var size = 0L
                context.contentResolver.openInputStream(uri)?.use { input -> temp.outputStream().use { out -> val buffer = ByteArray(65536); while(true) { val count = input.read(buffer); if(count<0) break; size += count; require(size <= 200L*1024*1024) { "File exceeds 200 MB" }; digest.update(buffer,0,count); out.write(buffer,0,count) } } } ?: error("Cannot read selected file")
                require(size > 0) { "Empty file" }
                val hash = digest.digest().joinToString("") { "%02x".format(it) }
                if(songs.any { it.id == hash }) continue
                val extension=name.substringAfterLast('.',"audio").lowercase().takeIf{it.matches(Regex("[a-z0-9]{1,8}"))} ?: "audio"
                val target = File(audio, "$hash.$extension")
                require(temp.renameTo(target)) { "Cannot store audio" }
                val metadata = MediaMetadataRetriever()
                var title = name.substringBeforeLast('.'); var artist = "Unknown artist"; var album = "Unknown album"; var duration = 0.0
                try { metadata.setDataSource(target.path); title=metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.takeIf { it.isNotBlank() } ?: title; artist=metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.takeIf { it.isNotBlank() } ?: artist; album=metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.takeIf { it.isNotBlank() } ?: album; duration=(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0)/1000 } catch (_: Exception) { } finally { metadata.release() }
                songs.add(Song(hash,title,artist,album,name,target.path,duration))
                try { save(songs) } catch(error:Exception) { target.delete(); throw error }
                added++
            } finally { temp.delete() }
        }
        return added
    }
}
