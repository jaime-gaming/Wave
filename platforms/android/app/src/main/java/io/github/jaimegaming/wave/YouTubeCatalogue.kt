package io.github.jaimegaming.wave

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL


data class OnlineVideo(val id: String, val title: String, val author: String)

object YouTubeCatalogue {
    private val videoId = Regex("^[A-Za-z0-9_-]{11}$")

    fun videoIdFromLink(text: String): String? {
        val uri = try { URI(text.trim()) } catch (_: Exception) { return null }
        if (uri.scheme?.lowercase() !in listOf("http", "https") || uri.userInfo != null) return null
        val host = uri.host?.lowercase() ?: return null
        val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
        val id = when (host) {
            "youtu.be", "www.youtu.be" -> parts.singleOrNull()
            "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com" -> when {
                uri.path == "/watch" -> uri.rawQuery.orEmpty().split('&')
                    .map { it.split('=', limit = 2) }
                    .firstOrNull { it.size == 2 && it[0] == "v" }?.get(1)
                parts.size == 2 && parts[0] in listOf("shorts", "embed", "live") -> parts[1]
                else -> null
            }
            else -> null
        }
        return id?.takeIf { videoId.matches(it) }
    }


    fun search(phrase: String): List<OnlineVideo> {
        val connection = URL("https://wave.jaime-gaming.com/api/youtube-search").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            val body = JSONObject().put("q", phrase.take(180)).put("limit", 10).toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            if (connection.responseCode != 200) throw IllegalStateException("Search unavailable")
            val data = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > 200_000) throw IllegalStateException("Response too large")
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            val items = JSONObject(String(data, Charsets.UTF_8)).optJSONArray("items") ?: return emptyList()
            return (0 until minOf(items.length(), 10)).mapNotNull { index ->
                val item = items.optJSONObject(index) ?: return@mapNotNull null
                val id = item.optString("videoId")
                val title = item.optString("title").take(200)
                if (!videoId.matches(id) || title.isBlank()) return@mapNotNull null
                OnlineVideo(id, title, item.optString("author").take(200))
            }
        } finally { connection.disconnect() }
    }
}
