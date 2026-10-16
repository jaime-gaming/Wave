package io.github.jaimegaming.wave

import org.junit.Assert.assertEquals
import org.junit.Test

class LyricsRetryTest {
    private val now = java.time.Instant.parse("2026-10-17T12:00:00Z").toEpochMilli()

    @Test fun shortDelayDoesNotImposeAMinute() {
        assertEquals(now + 2000, lyricsRetryDeadline("2", now))
        assertEquals(now + 1000, lyricsRetryDeadline("0", now))
    }

    @Test fun longProviderDelayIsNotTruncatedToOneDay() {
        assertEquals(now + 172_800_000, lyricsRetryDeadline("172800", now))
    }

    @Test fun httpDateIsHonored() {
        assertEquals(now + 5000, lyricsRetryDeadline("Sat, 17 Oct 2026 12:00:05 GMT", now))
    }

    @Test fun invalidOrMissingDelayUsesConservativeFallback() {
        for (value in listOf(null, "invalid", "-1")) {
            assertEquals(now + 60_000, lyricsRetryDeadline(value, now))
        }
    }
}
