package io.github.jaimegaming.wave

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlayerControlsTest {
    @Test fun muteRestoresThePreviousLevelAndRejectsInvalidValues() {
        val player = Player(ApplicationProvider.getApplicationContext<WaveApplication>())
        try {
            player.volume = .37f
            player.setDucked(true)
            assertEquals(.37f, player.volume, .001f)
            player.toggleMute()
            player.setDucked(false)
            assertEquals(0f, player.volume, .001f)
            player.toggleMute()
            assertEquals(.37f, player.volume, .001f)
            player.volume = Float.NaN
            player.volume = Float.POSITIVE_INFINITY
            assertEquals(.37f, player.volume, .001f)
            player.volume = 5f
            assertEquals(1f, player.volume, .001f)
            player.volume = -1f
            assertEquals(0f, player.volume, .001f)
        } finally { player.dispose() }
    }
    @Test fun anEmptyQueueCanBeShuffledWithoutStartingPlayback() {
        val player = Player(ApplicationProvider.getApplicationContext<WaveApplication>())
        try { player.shuffleUpcoming(); assertTrue(player.queue.isEmpty()); assertEquals(false, player.playing) }
        finally { player.dispose() }
    }
}
