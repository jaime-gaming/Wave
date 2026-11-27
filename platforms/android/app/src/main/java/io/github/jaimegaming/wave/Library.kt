package io.github.jaimegaming.wave

import android.annotation.SuppressLint
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest









data class Song(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val filename: String,
    val path: String,
    val duration: Double = 0.0,
    val favorite: Boolean = false,
    val lyrics: String = "",
    val checkedAt: Long = 0,
    val genre: String = "",
    val addedAt: Long = 0,
    val playCount: Int = 0,
    val lastPlayed: Long = 0,

    val bpm: Double? = null,
    val barOffset: Double? = null,
)


data class Playlist(
    val id: String,
    val name: String,
    val trackIds: List<String> = emptyList(),
    val createdAt: Long = 0,
)









class Library(private val context: Context) {
    private val index = AtomicFile(File(context.filesDir, "library.json"))
    private val lists = AtomicFile(File(context.filesDir, "playlists.json"))
    private val history = AtomicFile(File(context.filesDir, "history.json"))
    private val audio = File(context.filesDir, "audio").apply { mkdirs() }



    @Synchronized
    fun load(): List<Song> {
        val values = readArray(index)
        return (0 until values.length()).mapNotNull { i ->
            val o = values.optJSONObject(i) ?: return@mapNotNull null
            val id = o.optString("id").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val path = o.optString("path").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            Song(
                id = id,
                title = o.optString("title").ifBlank { "Untitled" },
                artist = o.optString("artist").ifBlank { "Unknown artist" },
                album = o.optString("album").ifBlank { "Unknown album" },
                filename = o.optString("filename"),
                path = path,
                duration = o.optDouble("duration", 0.0).takeIf { it.isFinite() } ?: 0.0,
                favorite = o.optBoolean("favorite"),
                lyrics = o.optString("lyrics"),
                checkedAt = o.optLong("checkedAt"),
                genre = o.optString("genre"),
                addedAt = o.optLong("addedAt"),
                playCount = o.optInt("playCount"),
                lastPlayed = o.optLong("lastPlayed"),
                bpm = o.optDouble("bpm", Double.NaN).takeIf { it.isFinite() && it in 60.0..200.0 },
                barOffset = o.optDouble("barOffset", Double.NaN).takeIf { it.isFinite() },
            )
        }
    }

    @Synchronized
    fun save(songs: List<Song>) {
        val array = JSONArray()
        songs.forEach { s ->
            array.put(
                JSONObject()
                    .put("id", s.id).put("title", s.title).put("artist", s.artist)
                    .put("album", s.album).put("filename", s.filename).put("path", s.path)
                    .put("duration", s.duration).put("favorite", s.favorite)
                    .put("lyrics", s.lyrics).put("checkedAt", s.checkedAt)
                    .put("genre", s.genre).put("addedAt", s.addedAt)
                    .put("playCount", s.playCount).put("lastPlayed", s.lastPlayed)
                    .put("bpm", s.bpm ?: JSONObject.NULL).put("barOffset", s.barOffset ?: JSONObject.NULL),
            )
        }
        write(index, array)
    }


    @Synchronized
    fun delete(songId: String) {
        val song = load().find { it.id == songId } ?: return
        val remaining = load().filterNot { it.id == songId }
        save(remaining)


        val owned = runCatching { File(song.path).canonicalFile }.getOrNull()
        val audioDirectory = runCatching { audio.canonicalFile }.getOrNull()
        val stillReferenced = owned != null && remaining.any { entry ->
            runCatching { File(entry.path).canonicalFile == owned }.getOrDefault(false)
        }
        if (owned != null && audioDirectory != null && owned.parentFile == audioDirectory && !stillReferenced) owned.delete()
        loadPlaylists().forEach { playlist ->
            if (songId in playlist.trackIds) updatePlaylist(playlist.copy(trackIds = playlist.trackIds - songId))
        }
    }



    @Synchronized
    fun loadPlaylists(): List<Playlist> {
        val values = readArray(lists)
        return (0 until values.length()).mapNotNull { i ->
            val o = values.optJSONObject(i) ?: return@mapNotNull null
            val id = o.optString("id").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val ids = o.optJSONArray("trackIds") ?: JSONArray()
            Playlist(
                id = id,
                name = o.optString("name").ifBlank { "Playlist" },
                trackIds = (0 until ids.length()).mapNotNull { idx -> ids.optString(idx).takeIf { it.isNotBlank() } },
                createdAt = o.optLong("createdAt"),
            )
        }
    }

    @Synchronized
    fun savePlaylists(playlists: List<Playlist>) {
        val array = JSONArray()
        playlists.forEach { p ->
            array.put(
                JSONObject()
                    .put("id", p.id).put("name", p.name)
                    .put("trackIds", JSONArray(p.trackIds))
                    .put("createdAt", p.createdAt),
            )
        }
        write(lists, array)
    }

    @Synchronized
    fun createPlaylist(name: String): Playlist {
        val trimmed = name.trim().take(100).ifBlank { "New playlist" }
        val playlist = Playlist(
            id = "pl-" + System.currentTimeMillis().toString(36),
            name = trimmed,
            createdAt = System.currentTimeMillis(),
        )
        savePlaylists(loadPlaylists() + playlist)
        return playlist
    }

    @Synchronized
    fun updatePlaylist(playlist: Playlist) {
        savePlaylists(loadPlaylists().map { if (it.id == playlist.id) playlist else it })
    }

    @Synchronized
    fun deletePlaylist(playlistId: String) {
        savePlaylists(loadPlaylists().filterNot { it.id == playlistId })
    }




    @Synchronized
    fun loadPlays(): List<Play> {
        val values = readArray(history)
        return (0 until values.length()).mapNotNull { i ->
            val o = values.optJSONObject(i) ?: return@mapNotNull null
            val songId = o.optString("songId").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            Play(songId, o.optLong("at"), o.optInt("seconds"), o.optBoolean("completed"))
        }.sortedBy { it.at }
    }

    @Synchronized
    fun addPlay(play: Play) {
        val plays = loadPlays() + play


        val recentFrom = System.currentTimeMillis() - HISTORY_DAYS * 24L * 60 * 60 * 1000
        val recent = plays.filter { it.at >= recentFrom }.takeLast(HISTORY_PLAYS)
        val room = (MAX_PLAYS - recent.size).coerceAtLeast(0)
        val kept = plays.filter { it.at < recentFrom }.takeLast(room) + recent
        val array = JSONArray()
        kept.forEach { p ->
            array.put(
                JSONObject().put("songId", p.songId).put("at", p.at)
                    .put("seconds", p.seconds).put("completed", p.completed),
            )
        }
        write(history, array)
    }

    @Synchronized
    fun clearPlays() {
        write(history, JSONArray())
    }










    @Synchronized
    fun importFiles(uris: List<Uri>): Int {
        val songs = load().toMutableList()
        val knownIds = songs.mapTo(HashSet()) { it.id }
        val copiedFiles = mutableListOf<File>()
        var added = 0
        for (uri in uris) {
            val name = displayName(uri)
            val temp = File.createTempFile("import-", ".tmp", audio)
            try {
                val digest = MessageDigest.getInstance("SHA-256")
                var size = 0L
                context.contentResolver.openInputStream(uri)?.use { input ->
                    temp.outputStream().use { out ->
                        val buffer = ByteArray(65536)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            size += count
                            require(size <= MAX_BYTES) { "$name is larger than 200 MB." }
                            digest.update(buffer, 0, count)
                            out.write(buffer, 0, count)
                        }
                    }
                } ?: error("Cannot read $name.")
                require(size > 0) { "$name is empty." }
                val hash = digest.digest().joinToString("") { "%02x".format(it) }
                if (!knownIds.add(hash)) continue
                val extension = name.substringAfterLast('.', "audio").lowercase()
                    .takeIf { it.matches(Regex("[a-z0-9]{1,8}")) } ?: "audio"
                val target = File(audio, "$hash.$extension")
                if (target.exists()) target.delete()
                val moved = temp.renameTo(target) || run {
                    temp.copyTo(target, overwrite = true)
                    temp.delete()
                    target.exists()
                }
                require(moved) { "Cannot store $name." }
                copiedFiles.add(target)
                songs.add(read(target, hash, name, target.path))
                added++
            } finally {
                if (temp.exists()) temp.delete()
            }
        }
        if (added > 0) {
            try {
                save(songs)
            } catch (error: Exception) {
                copiedFiles.forEach { runCatching { it.delete() } }
                throw error
            }
        }
        return added
    }










    @SuppressLint("MissingPermission")
    @Synchronized
    fun importFromMediaStore(): Int {
        val songs = load().toMutableList()
        val knownIds = songs.mapTo(HashSet()) { it.id }
        var added = 0
        val projection = buildList {
            add(MediaStore.Audio.Media._ID)
            add(MediaStore.Audio.Media.TITLE)
            add(MediaStore.Audio.Media.ARTIST)
            add(MediaStore.Audio.Media.ALBUM)
            add(MediaStore.Audio.Media.DISPLAY_NAME)
            add(MediaStore.Audio.Media.DURATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) add(MediaStore.Audio.Media.GENRE)
        }.toTypedArray()
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
        context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            null,
            "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE",
        )?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val genreColumn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                cursor.getColumnIndex(MediaStore.Audio.Media.GENRE)
            } else -1
            while (cursor.moveToNext()) {
                val uri = Uri.withAppendedPath(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    cursor.getLong(idColumn).toString(),
                )
                val id = "media-" + digestOf(uri.toString()).take(24)
                if (!knownIds.add(id)) continue
                val name = cursor.getString(nameColumn) ?: "Audio"
                val genre = if (genreColumn >= 0) cursor.getString(genreColumn)?.trim().orEmpty() else ""
                songs.add(
                    Song(
                        id = id,
                        title = cursor.getString(titleColumn)?.takeIf { it.isNotBlank() } ?: name.substringBeforeLast('.'),
                        artist = cursor.getString(artistColumn)?.takeIf { it.isNotBlank() && it != "<unknown>" }
                            ?: "Unknown artist",
                        album = cursor.getString(albumColumn)?.takeIf { it.isNotBlank() && it != "<unknown>" }
                            ?: "Unknown album",
                        filename = name,
                        path = uri.toString(),
                        duration = cursor.getLong(durationColumn) / 1000.0,
                        genre = genre,
                        addedAt = System.currentTimeMillis(),
                    ),
                )
                added++
            }
        }
        if (added > 0) save(songs)
        return added
    }







    @Synchronized
    fun importFolder(tree: Uri): Int {
        val uris = mutableListOf<Uri>()

        val queue = ArrayDeque(listOf(DocumentsContract.getTreeDocumentId(tree)))
        while (queue.isNotEmpty() && uris.size < MAX_FILES) {
            val documentId = queue.removeFirst()
            val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, documentId)
            runCatching {
                context.contentResolver.query(
                    childUri,
                    arrayOf(
                        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                        DocumentsContract.Document.COLUMN_MIME_TYPE,
                    ),
                    null,
                    null,
                    null,
                )?.use { cursor ->
                    while (cursor.moveToNext()) {
                        val id = cursor.getString(0) ?: continue
                        val name = cursor.getString(1) ?: "Audio"
                        val mime = cursor.getString(2) ?: ""
                        val child = DocumentsContract.buildDocumentUriUsingTree(tree, id)
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                            queue.add(id)
                        } else if (mime.startsWith("audio/") || name.substringAfterLast('.', "").lowercase() in AUDIO_EXTENSIONS) {
                            uris.add(child)
                        }
                    }
                }
            }
        }
        return importFiles(uris)
    }

    private fun displayName(uri: Uri): String =
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
            ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Audio"


    private fun read(file: File, id: String, name: String, path: String): Song {
        var title = name.substringBeforeLast('.')
        var artist = "Unknown artist"
        var album = "Unknown album"
        var genre = ""
        var duration = 0.0
        val metadata = MediaMetadataRetriever()
        try {
            metadata.setDataSource(path)
            title = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.takeIf { it.isNotBlank() } ?: title
            artist = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.takeIf { it.isNotBlank() } ?: artist
            album = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.takeIf { it.isNotBlank() } ?: album
            genre = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE)?.takeIf { it.isNotBlank() } ?: ""
            duration = (metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000
        } catch (_: Exception) {

        } finally {
            metadata.release()
        }
        return Song(
            id = id,
            title = title,
            artist = artist,
            album = album,
            filename = name,
            path = path,
            duration = duration,
            genre = genre,
            addedAt = System.currentTimeMillis(),
        )
    }

    private fun digestOf(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun readArray(file: AtomicFile): JSONArray {
        if (!file.baseFile.exists()) return JSONArray()
        return try {
            JSONArray(file.openRead().bufferedReader().use { it.readText() })
        } catch (_: Exception) {


            JSONArray()
        }
    }

    private fun write(file: AtomicFile, array: JSONArray) {
        val stream = file.startWrite()
        try {
            stream.write(array.toString().toByteArray())
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }

    private companion object {
        const val MAX_BYTES = 200L * 1024 * 1024
        const val MAX_FILES = 2000
        val AUDIO_EXTENSIONS = setOf("mp3", "wav", "m4a", "ogg", "flac", "opus", "aac")
    }
}
