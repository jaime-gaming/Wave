package io.github.jaimegaming.wave
import org.junit.Test
import org.junit.Assert.*
class ContractsTest {
 @Test fun lrcOffsetsAndRepeatedTimestamps() { val lines=parseLrc("[offset:100]\n[00:01.25][00:03]Hello");assertEquals(2,lines.size);assertEquals(1.15,lines[0].time,.00001);assertEquals("Hello",lines[1].text) }
 @Test fun positionIsPublishedTenTimesASecond() { assertFalse(shouldPublishTime(10.0,10.05,false));assertTrue(shouldPublishTime(10.0,10.1,false));assertTrue(shouldPublishTime(10.0,10.02,true)) }
 @Test fun equalPowerAndMetadata() { val gains=powerGains(.5);assertEquals(1.0,(gains.first*gains.first+gains.second*gains.second).toDouble(),.00001);assertEquals("beyonce",canonical("Beyoncé")) }
 @Test fun handoverArrivesEarlyAndHolds() {
  val early=handoverGains(.25);val late=handoverGains(.75)
  assertEquals(1.0,(early.first*early.first+early.second*early.second).toDouble(),.0001)
  assertTrue("incoming is already audible a quarter in",early.second>.6)
  assertTrue("outgoing is still leading the middle",handoverGains(.5).first>handoverGains(.5).second)
  assertTrue("the outgoing song leaves at the end",late.first<.6&&late.second>.8)
 }
}
