package io.github.jaimegaming.wave

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.pow

/**
 * Wave 3.0 native contracts that are shared by the phone's UI and player.
 *
 * No Android, Compose or MediaPlayer type is used here: Mix planning, adaptive
 * Remix measurements and automatic performance profiles stay pure so the same
 * rules can be unit-tested beside the existing library contracts.
 */

enum class DeviceProfile { LITE, BALANCED, FULL }

data class DeviceSignals(
    val memoryGB: Double? = null,
    val cores: Int? = null,
    val reducedMotion: Boolean = false,
    val lowPowerMode: Boolean = false,
    val screenScale: Double? = null,
    val smallScreen: Boolean = false,
)

object WavePerformance {
    fun profile(signals: DeviceSignals): DeviceProfile {
        if (signals.reducedMotion) return DeviceProfile.LITE
        val informative = signals.memoryGB != null || signals.cores != null || signals.lowPowerMode
        if (!informative) return DeviceProfile.FULL
        var score = 0
        signals.memoryGB?.let {
            score += if (it <= 2) -2 else if (it <= 4) -1 else if (it >= 6) 1 else 0
        }
        signals.cores?.let {
            score += if (it <= 2) -2 else if (it <= 4) -1 else if (it >= 8) 1 else 0
        }
        if (signals.lowPowerMode) score -= 3
        if ((signals.screenScale ?: 0.0) >= 3) score -= 1
        if (signals.smallScreen) score -= 1
        return if (score <= -3) DeviceProfile.LITE else if (score <= 0) DeviceProfile.BALANCED else DeviceProfile.FULL
    }

    fun rowsPerPage(profile: DeviceProfile): Int = when (profile) {
        DeviceProfile.LITE -> 32
        DeviceProfile.BALANCED -> 60
        DeviceProfile.FULL -> 80
    }

    fun ambientMotion(profile: DeviceProfile): Boolean = profile == DeviceProfile.FULL

    fun heavyEffects(profile: DeviceProfile): Boolean = profile != DeviceProfile.LITE
}

/** The page fills its window; these measurements only change its rhythm. */
data class RemixMetrics(
    val columns: Int,
    val heroSp: Float,
    val titleSp: Float,
    val coverDp: Float,
    val paddingDp: Float,
    val gapDp: Float,
    val maxContentDp: Float,
)

fun remixMetrics(
    widthDp: Int,
    heightDp: Int,
    fontScale: Float = 1f,
    profile: DeviceProfile = DeviceProfile.FULL,
): RemixMetrics {
    val safeWidth = widthDp.coerceAtLeast(280).toFloat()
    val safeHeight = heightDp.coerceAtLeast(320).toFloat()
    val safeFont = fontScale.coerceIn(0.85f, 1.3f)
    val columns = when {
        safeWidth < 600f -> 1
        safeWidth < 900f -> 2
        safeWidth < 1600f -> 3
        else -> 4
    }
    val ceiling = if (profile == DeviceProfile.LITE) 180f else 320f
    return RemixMetrics(
        columns = columns,
        heroSp = (32f + safeWidth * 0.012f).coerceIn(30f, 58f) * safeFont,
        titleSp = (20f + safeWidth * 0.004f).coerceIn(20f, 34f) * safeFont,
        coverDp = minOf(safeWidth * 0.22f, safeHeight * 0.3f, ceiling).coerceIn(72f, ceiling),
        paddingDp = (8f + safeWidth * 0.008f).coerceIn(10f, 34f),
        gapDp = (8f + safeWidth * 0.006f).coerceIn(8f, 28f),
        // A centred max width would recreate the empty right-hand strip.
        maxContentDp = safeWidth,
    )
}

/** Four beats to the bar, from an optional tag or a steady local LRC pulse. */
data class PulseGrid(val bpm: Double, val offset: Double) {
    val bar: Double get() = 4 * 60 / bpm
}

data class MixPulsePlan(
    val startAt: Double,
    val cue: Double,
    val overlap: Double,
    val bars: Int,
    val pulseAligned: Boolean = true,
)

object NativePulse {
    const val TARGET_SECONDS = 20.0
    const val MIN_INSTRUMENTAL_SECONDS = 4.0
    const val DRIFT_BEATS = 1.5
    const val OCTAVE_TOLERANCE = 0.03

    /** A steady pulse inferred from the listener's own LRC line timings. */
    fun estimatedBpm(stamps: List<Double>): Double? {
        val times = stamps.filter { it.isFinite() && it >= 0 }.sorted()
        if (times.size < 8) return null
        val gaps = times.zipWithNext { a, b -> b - a }.filter { it in 0.25..8.0 }
        if (gaps.size < 6) return null
        val ordered = gaps.sorted()
        val median = ordered[ordered.size / 2]
        val steady = gaps.count { abs(it - median) <= median * 0.12 }
        if (steady * 5 < gaps.size * 3) return null
        val base = 60 / median
        return (0..5)
            .map { base * 2.0.pow(it) }
            .filter { it in 60.0..200.0 }
            .minByOrNull { abs(it - 120) }
    }

    /** Optional tempo tags win; otherwise the LRC timings describe the pulse. */
    fun grid(song: Song): PulseGrid? {
        val lines = parseLrc(song.lyrics).map { it.time }.filter { it.isFinite() && it >= 0 }
        val tagged = song.bpm?.takeIf { it.isFinite() && it in 60.0..200.0 }
        val inferred = tagged ?: estimatedBpm(lines) ?: return null
        val bar = 4 * 60 / inferred
        val first = lines.minOrNull()
        val offset = when {
            tagged != null -> (song.barOffset ?: 0.0).takeIf { it.isFinite() }?.let { ((it % bar) + bar) % bar } ?: 0.0
            first != null -> first - floor(first / bar) * bar
            else -> 0.0
        }
        return PulseGrid(inferred, offset)
    }

    private fun downbeat(grid: PulseGrid, from: Double, to: Double, desired: Double): Double? {
        if (to < from) return null
        val bar = grid.bar
        val first = ceil((from - grid.offset) / bar - 1e-9).toInt()
        var best: Double? = null
        var distance = Double.POSITIVE_INFINITY
        for (index in first..(first + 128)) {
            val time = grid.offset + index * bar
            if (time > to + 1e-9) break
            val candidate = abs(time - desired)
            val current = best
            if (candidate < distance - 1e-9 || (candidate <= distance + 1e-9 && (current == null || time < current))) {
                best = time
                distance = candidate
            }
        }
        return best
    }

    /**
     * Instrumental outro and intro meet on a downbeat of both grids. Neither
     * recording is time-stretched; only the cue positions and whole-bar overlap
     * move. When an honest pulse cannot be found the caller keeps its fade.
     */
    fun plan(outgoing: Song, incoming: Song): MixPulsePlan? {
        if (outgoing.duration <= 8 || incoming.duration <= 8) return null
        val gridA = grid(outgoing) ?: return null
        val gridB = grid(incoming) ?: return null
        val outLines = parseLrc(outgoing.lyrics).map { it.time }.filter { it.isFinite() && it >= 0 }
        val inLines = parseLrc(incoming.lyrics).map { it.time }.filter { it.isFinite() && it >= 0 }
        val lastVoice = outLines.maxOrNull() ?: return null
        val firstVoice = inLines.minOrNull() ?: return null
        val tailStart = minOf(outgoing.duration, lastVoice + 1.5)
        val tailEnd = outgoing.duration
        val headEnd = minOf(incoming.duration, firstVoice)
        if (tailEnd - tailStart < MIN_INSTRUMENTAL_SECONDS || headEnd < MIN_INSTRUMENTAL_SECONDS) return null
        val barA = gridA.bar
        val barB = gridB.bar
        val startCeiling = tailEnd - 2 * barA
        val cueCeiling = headEnd - 2 * barB
        if (startCeiling < tailStart || cueCeiling < 0) return null
        val startAt = downbeat(
            gridA,
            tailStart,
            startCeiling,
            maxOf(tailStart, outgoing.duration - TARGET_SECONDS),
        ) ?: return null
        val cue = downbeat(gridB, 0.0, cueCeiling, minOf(6.0, cueCeiling)) ?: return null
        val ratio = gridA.bpm / gridB.bpm
        val octave = abs(ratio / 2 - 1) <= OCTAVE_TOLERANCE || abs(ratio * 2 - 1) <= OCTAVE_TOLERANCE
        val drift = if (octave) 0.0 else abs(1 - gridB.bpm / gridA.bpm)
        val driftLimit = if (drift > 0) DRIFT_BEATS * 60 / gridA.bpm / drift else Double.POSITIVE_INFINITY
        val available = minOf(TARGET_SECONDS, tailEnd - startAt, headEnd - cue, driftLimit)
        val bars = floor(available / barA + 1e-9).toInt()
        if (bars < 2) return null
        return MixPulsePlan(
            startAt = startAt,
            cue = cue,
            overlap = bars * barA,
            bars = bars,
        )
    }
}
