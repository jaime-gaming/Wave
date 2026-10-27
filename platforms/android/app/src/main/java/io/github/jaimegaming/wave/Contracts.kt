package io.github.jaimegaming.wave
import kotlin.math.cos
import kotlin.math.sin
import java.text.Normalizer

data class LyricLine(val time: Double, val text: String)
fun parseLrc(raw: String): List<LyricLine> {
    val offset = Regex("\\[offset:([+-]?\\d+)\\]").find(raw)?.groupValues?.get(1)?.toDoubleOrNull()?.div(1000) ?: 0.0
    val regex = Regex("\\[(\\d{1,4}):([0-5]\\d)(?:[.:](\\d{1,3}))?\\]")
    return raw.take(100000).lineSequence().flatMap { row -> val text=regex.replace(row,"").trim(); regex.findAll(row).map { m -> LyricLine((m.groupValues[1].toDouble()*60+m.groupValues[2].toDouble()+("0."+m.groupValues[3].ifEmpty { "0" }).toDouble()-offset).coerceAtLeast(0.0),text) } }.take(2000).sortedBy { it.time }.toList()
}
/** The bar shows tenths of a second, so a position is published when it moves one. */
fun shouldPublishTime(last: Double, next: Double, fading: Boolean) = fading || kotlin.math.abs(next - last) >= .1
fun powerGains(progress: Double): Pair<Float,Float> { val angle=progress.coerceIn(0.0,1.0)*Math.PI/2; return cos(angle).toFloat() to sin(angle).toFloat() }
fun canonical(value:String) = Normalizer.normalize(value,Normalizer.Form.NFKD).replace(Regex("\\p{M}"),"").lowercase().replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()
