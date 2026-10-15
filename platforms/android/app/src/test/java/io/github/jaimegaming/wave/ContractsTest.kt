package io.github.jaimegaming.wave
import org.junit.Test
import org.junit.Assert.*
class ContractsTest {
 @Test fun lrcOffsetsAndRepeatedTimestamps() { val lines=parseLrc("[offset:100]\n[00:01.25][00:03]Hello");assertEquals(2,lines.size);assertEquals(1.15,lines[0].time,.00001);assertEquals("Hello",lines[1].text) }
 @Test fun equalPowerAndMetadata() { val gains=powerGains(.5);assertEquals(1.0,(gains.first*gains.first+gains.second*gains.second).toDouble(),.00001);assertEquals("beyonce",canonical("Beyoncé")) }
}
