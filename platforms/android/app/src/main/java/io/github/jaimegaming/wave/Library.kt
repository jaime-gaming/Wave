package io.github.jaimegaming.wave

import android.annotation.SuppressLint
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * A song, as this device knows it.
 *
 * `id` is the SHA-256 of the audio bytes for an imported file and a hash of the
 * content URI for music that stays where the system keeps it, so importing the
 * same file twice cannot make two rows. `path` is a real path for a copied file
 * and a `content://` URI for one that was left in place; both play.
 */
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
)

/** A list of songs in an order of the listener's choosing. */
data class Playlist(
    val id: String,
    val name: String,
    val trackIds: List<String> = emptyList(),
    val createdAt: Long = 0,
)

/**
 * Everything Wave keeps on the phone, in three files.
 *
 * `library.json` is the collection, `playlists.json` the lists built over it and
 * `history.json` what was heard. All three are written through [AtomicFile]: a
 * phone that dies mid-write loses the last change instead of the whole library,
 * which is the one guarantee a local app has to keep.
 */
class Library(private val context: Context) {
    private val index = AtomicFile(File(context.filesDir, "library.json"))
    private val lists = AtomicFile(File(context.filesDir, "playlists.json"))
    private val history = AtomicFile(File(context.filesDir, "history.json"))
    private val audio = File(context.filesDir, "audio").apply { mkdirs() }

    // --- the collection ----------------------------------------------------

    @Synchronized
    fun load(): List<Song> {
        val values = readArray(index)
        return (0 until values.length()).map { i ->
            val o = values.getJSONObject(i)
            Song(
                id = o.getString("id"),
                title = o.getString("title"),
                artist = o.getString("artist"),
                album = o.getString("album"),
                filename = o.getString("filename"),
                path = o.getString("path"),
                duration = o.optDouble("duration", 0.0),
                favorite = o.optBoolean("favorite"),
                lyrics = o.optString("lyrics"),
                checkedAt = o.optLong("checkedAt"),
                genre = o.optString("genre"),
                addedAt = o.optLong("addedAt"),
                playCount = o.optInt("playCount"),
                lastPlayed = o.optLong("lastPlayed"),
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
                    .put("playCount", s.playCount).put("lastPlayed", s.lastPlayed),
            )
        }
        write(index, array)
    }

    /** Forgets a song, its copied file and any playlist entry that pointed at it. */
    @Synchronized
    fun delete(songId: String) {
        val song = load().find { it.id == songId } ?: return
        val remaining = load().filterNot { it.id == songId }
        save(remaining)
        // Only copies inside Wave's own audio directory are ours to remove.
        // A legacy absolute path, URI, or symlink must never delete an original.
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

    // --- playlists ---------------------------------------------------------

    @Synchronized
    fun loadPlaylists(): List<Playlist> {
        val values = readArray(lists)
        return (0 until values.length()).map { i ->
            val o = values.getJSONObject(i)
            val ids = o.optJSONArray("trackIds") ?: JSONArray()
            Playlist(
                id = o.getString("id"),
                name = o.getString("name"),
                trackIds = (0 until ids.length()).map { ids.getString(it) },
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

    // --- listening ---------------------------------------------------------

    /** The newest 2000 listens, oldest first. Older ones fall off the end. */
    @Synchronized
    fun loadPlays(): List<Play> {
        val values = readArray(history)
        return (0 until values.length()).map { i ->
            val o = values.getJSONObject(i)
            Play(o.getString("songId"), o.optLong("at"), o.optInt("seconds"), o.optBoolean("completed"))
        }.sortedBy { it.at }
    }

    @Synchronized
    fun addPlay(play: Play) {
        val plays = loadPlays() + play
        val kept = if (plays.size > 2000) plays.takeLast(2000) else plays
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

    // --- importing ---------------------------------------------------------

    /**
     * Copies the chosen files into the app's own storage.
     *
     * A file is read once: the bytes are hashed as they stream past, and the hash
     * is what decides whether it is new. Nothing is re-encoded — the copy is the
     * file, byte for byte — so the audio that came in is the audio that plays.
     */
    @Synchronized
    fun importFiles(uris: List<Uri>): Int {
        val songs = load().toMutableList()
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
                if (songs.any { it.id == hash }) continue
                val extension = name.substringAfterLast('.', "audio").lowercase()
                    .takeIf { it.matches(Regex("[a-z0-9]{1,8}")) } ?: "audio"
                val target = File(audio, "$hash.$extension")
                require(temp.renameTo(target)) { "Cannot store $name." }
                songs.add(read(target, hash, name, target.path))
                try {
                    save(songs)
                } catch (error: Exception) {
                    target.delete()
                    throw error
                }
                added++
            } finally {
                temp.delete()
            }
        }
        return added
    }

    /**
     * Adds what the system already indexes, without copying a byte.
     *
     * The file stays where the listener put it, so a playlist of the phone's music
     * costs nothing and stays in step with the rest of the phone. Entries the
     * library already has are skipped by id.
     */
    // The interface asks for the audio permission before it calls this, and says
    // so plainly when it is refused; the query itself cannot check that here.
    @SuppressLint("MissingPermission")
    @Synchronized
    fun importFromMediaStore(): Int {
        val songs = load().toMutableList()
        var added = 0
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DURATION,
        )
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
            while (cursor.moveToNext()) {
                val uri = Uri.withAppendedPath(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    cursor.getLong(idColumn).toString(),
                )
                val id = "media-" + digestOf(uri.toString()).take(24)
                if (songs.any { it.id == id }) continue
                val name = cursor.getString(nameColumn) ?: "Audio"
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
                        addedAt = System.currentTimeMillis(),
                    ),
                )
                added++
            }
        }
        if (added > 0) save(songs)
        return added
    }

    /**
     * Imports every audio file in a folder the listener picked, at any depth.
     *
     * The tree is walked through the document provider, so it works the same for
     * internal storage, an SD card and a cloud folder the phone has mounted.
     */
    @Synchronized
    fun importFolder(tree: Uri): Int {
        val uris = mutableListOf<Uri>()
        // Document ids to visit, starting at the picked folder itself.
        val queue = ArrayDeque(listOf(DocumentsContract.getTreeDocumentId(tree)))
        while (queue.isNotEmpty() && uris.size < MAX_FILES) {
            val documentId = queue.removeFirst()
            val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, documentId)
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
                    val id = cursor.getString(0)
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
        return importFiles(uris)
    }

    private fun displayName(uri: Uri): String =
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
            ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Audio"

    /** Reads the tags once, when the file arrives, and never again. */
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
            // A file with no tags is still a file; the name is a fine title.
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
            // A half-written file from an older build must not lock the app out
            // of its own library; an empty list is recoverable, a crash is not.
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
