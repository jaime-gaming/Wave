package io.github.jaimegaming.wave
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

class LyricsClient {
    private var retryAt=0L
    private var requestedAt=0L
    @Synchronized fun find(song:Song):String {
        require(System.currentTimeMillis()>=retryAt) { "Lyrics service is cooling down." }
        var title=song.title;var artist=song.artist
        if(artist=="Unknown artist") { val parts=song.filename.substringBeforeLast('.').split(" - "); if(parts.size!=2)return "";artist=parts[0];title=parts[1] }
        fun get(path:String):String {
            val wait=500-(System.currentTimeMillis()-requestedAt)
            if(wait>0)Thread.sleep(wait)
            requestedAt=System.currentTimeMillis()
            val connection=URI("https://lrclib.net/api/$path").toURL().openConnection() as HttpURLConnection
            connection.connectTimeout=10000;connection.readTimeout=10000;connection.setRequestProperty("User-Agent","Wave/0.1.1 (https://github.com/jaime-gaming/Wave)")
            try {
                val status=connection.responseCode
                if(status==429||status==503) { retryAt=lyricsRetryDeadline(connection.getHeaderField("Retry-After"),System.currentTimeMillis());error("Lyrics service is busy.") }
                if(status==404)return ""
                require(status==200) { "Lyrics service unavailable" }
                val bytes=connection.inputStream.use { input -> val output=java.io.ByteArrayOutputStream();val chunk=ByteArray(8192);while(true){val count=input.read(chunk);if(count<0)break;require(output.size()+count<=600000){"Lyrics response too large"};output.write(chunk,0,count)};output.toByteArray() };return String(bytes,Charsets.UTF_8)
            } finally { connection.disconnect() }
        }
        fun match(o:JSONObject):Boolean=canonical(o.optString("trackName"))==canonical(title)&&canonical(o.optString("artistName"))==canonical(artist)&&(song.duration<=0||kotlin.math.abs(o.optDouble("duration")-song.duration)<=3)
        fun raw(o:JSONObject):String=o.optString("syncedLyrics").takeUnless { it.isBlank()||it=="null" } ?: o.optString("plainLyrics").takeUnless { it=="null" } ?: ""
        val query="track_name=${URLEncoder.encode(title,"UTF-8")}&artist_name=${URLEncoder.encode(artist,"UTF-8")}"+(if(song.duration in 1.0..3600.0) "&duration=${song.duration}" else "")
        val exact=get("get?$query");if(exact.isNotBlank()) { val record=JSONObject(exact);if(match(record))return raw(record).take(100000) }
        val results=JSONArray(get("search?track_name=${URLEncoder.encode(title,"UTF-8")}&artist_name=${URLEncoder.encode(artist,"UTF-8")}").ifBlank { "[]" })
        for(i in 0 until minOf(results.length(),20)) { val record=results.getJSONObject(i);if(match(record))return raw(record).take(100000) }
        return ""
    }
}

/** Keep real provider deadlines; a missing/invalid header needs a conservative fallback. */
internal fun lyricsRetryDeadline(retry: String?, now: Long): Long {
    val seconds = retry?.trim()?.toLongOrNull()
    if (seconds != null && seconds >= 0) {
        return now + seconds.coerceIn(1, (Long.MAX_VALUE - now) / 1000) * 1000
    }
    val date = try {
        java.time.ZonedDateTime.parse(retry, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME)
            .toInstant().toEpochMilli()
    } catch (_: Exception) {
        now + 60_000
    }
    return date.coerceAtLeast(now + 1000)
}
