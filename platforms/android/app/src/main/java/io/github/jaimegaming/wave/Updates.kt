package io.github.jaimegaming.wave

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL


object Updates {
    private fun version(value: String): List<Int>? {
        val match = Regex("^v?(\\d+)\\.(\\d+)\\.(\\d+)$").matchEntire(value) ?: return null
        return match.groupValues.drop(1).map { it.toIntOrNull() ?: return null }
    }

    private fun java.io.Reader.readTextLimited(limit: Int): String? {
        val result = StringBuilder()
        val buffer = CharArray(4096)
        while (true) {
            val count = read(buffer)
            if (count < 0) return result.toString()
            if (result.length + count > limit) return null
            result.append(buffer, 0, count)
        }
    }

    suspend fun check(context: Context, current: String): String? = withContext(Dispatchers.IO) {
        val prefs = context.getSharedPreferences("wave_updates", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("checked", 0) < 24 * 60 * 60 * 1000L) return@withContext null
        val installed = version(current) ?: return@withContext null
        try {
            val connection = URL("https://api.github.com/repos/jaime-gaming/Wave/releases/latest").openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.setRequestProperty("Accept", "application/vnd.github+json")
                connection.setRequestProperty("User-Agent", "Wave-Android")
                if (connection.responseCode != 200) return@withContext null
                val body = connection.inputStream.bufferedReader().use { it.readTextLimited(1_000_000) } ?: return@withContext null
                val tag = JSONObject(body).optString("tag_name")
                val latest = version(tag) ?: return@withContext null
                prefs.edit().putLong("checked", now).apply()
                val newer = latest.zip(installed).firstOrNull { (a, b) -> a != b }?.let { (a, b) -> a > b } ?: false
                if (newer) tag else null
            } finally { connection.disconnect() }
        } catch (_: Exception) { null }
    }
}
