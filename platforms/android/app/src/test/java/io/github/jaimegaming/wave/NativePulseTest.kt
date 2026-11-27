package io.github.jaimegaming.wave

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativePulseTest {
    private fun pulseLyrics(start: Int = 30): String = (0 until 80).joinToString("\n") { index ->
        val seconds = start + index * 2
        "[${"%02d".format(seconds / 60)}:${"%02d".format(seconds % 60)}.00]Line $index"
    }

    private fun song(id: String, bpm: Double? = 120.0, offset: Double? = .05) = Song(
        id = id,
        title = id,
        artist = "Wave Tests",
        album = "Pulse",
        filename = "$id.m4a",
        path = "$id.m4a",
        duration = 240.0,
        lyrics = pulseLyrics(),
        bpm = bpm,
        barOffset = offset,
    )

    @Test
    fun equalInstrumentalPulsesMeetOnBothDownbeats() {
        val plan = NativePulse.plan(song("a"), song("b"))
        assertNotNull(plan)
        assertTrue(plan!!.pulseAligned)
        assertEquals(9, plan.bars)
        assertEquals(18.0, plan.overlap, .001)
        assertTrue(plan.startAt >= 218.0)
        assertTrue(plan.cue >= 4.0)
    }

    @Test
    fun differentTemposKeepTheOverlapShort() {
        val equal = NativePulse.plan(song("a"), song("b"))!!
        val drifting = NativePulse.plan(song("a"), song("c", bpm = 126.0))
        assertNotNull(drifting)
        assertTrue(drifting!!.bars < equal.bars)
        assertTrue(drifting.overlap < equal.overlap)
    }

    @Test
    fun nearHalfTimeStillAccountsForResidualDrift() {
        val plan = NativePulse.plan(song("a", bpm = 174.0), song("b", bpm = 89.5))!!
        val drift = plan.overlap * kotlin.math.abs(1 - 89.5 * 2 / 174.0)
        assertTrue(drift <= NativePulse.DRIFT_BEATS * 60 / 174.0 + .001)
    }

    @Test
    fun steadyLrcTimingsInferThePulseWithoutTags() {
        val untagged = song("a", bpm = null, offset = null)
        val inferred = NativePulse.estimatedBpm(parseLrc(untagged.lyrics).map { it.time })
        assertNotNull(inferred)
        assertEquals(120.0, inferred!!, .001)
        assertNotNull(NativePulse.plan(untagged, song("b", bpm = null, offset = null)))
        assertNull(NativePulse.plan(untagged.copy(lyrics = ""), song("b")))
    }

    @Test
    fun automaticProfilesAndRemixMeasurementsAdaptWithoutSettings() {
        assertEquals(
            DeviceProfile.LITE,
            WavePerformance.profile(DeviceSignals(reducedMotion = true)),
        )
        assertEquals(
            DeviceProfile.FULL,
            WavePerformance.profile(DeviceSignals(memoryGB = 8.0, cores = 8)),
        )
        assertEquals(
            DeviceProfile.LITE,
            WavePerformance.profile(DeviceSignals(memoryGB = 2.0, cores = 2, lowPowerMode = true)),
        )
        val phone = remixMetrics(320, 640, 1f, DeviceProfile.LITE)
        val tablet = remixMetrics(820, 1180, 1f, DeviceProfile.BALANCED)
        val fourK = remixMetrics(3840, 2160, 1f, DeviceProfile.FULL)
        assertEquals(1, phone.columns)
        assertEquals(2, tablet.columns)
        assertEquals(4, fourK.columns)
        assertEquals(320f, phone.maxContentDp)
        assertEquals(3840f, fourK.maxContentDp)
        assertTrue(fourK.heroSp > phone.heroSp)
        assertTrue(fourK.paddingDp >= phone.paddingDp)
    }
}
