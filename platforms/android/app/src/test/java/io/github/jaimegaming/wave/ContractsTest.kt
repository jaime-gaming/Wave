package io.github.jaimegaming.wave
import org.junit.Test
import org.junit.Assert.*
class ContractsTest {
 @Test fun lrcOffsetsAndRepeatedTimestamps() { val lines=parseLrc("[offset:100]\n[00:01.25][00:03]Hello");assertEquals(2,lines.size);assertEquals(1.15,lines[0].time,.00001);assertEquals("Hello",lines[1].text) }
 @Test fun enhancedLyricsKeepWordTimesAndFallbackSafely() {
  val lines=parseLrc("[offset:100]\n[00:01][00:11]<00:01>Hello <00:02>world<00:03>")
  assertEquals("Hello world", lines[0].text)
  assertEquals(2, lines[0].words.size)
  assertEquals(.9, lines[0].words[0].time, .00001)
  assertEquals(1.9, lines[0].words[0].end!!, .00001)
  assertEquals(10.9, lines[1].words[0].time, .00001)
  assertTrue(parseLrc("[00:01]Plain line")[0].words.isEmpty())
  val invalid=parseLrc("[00:01]<00:00>Early<00:02>")[0]
  assertTrue(invalid.words.isEmpty())
  assertEquals("Early", invalid.text)
 }
 @Test fun listeningCountsOnlyOncePerPlaybackAndIgnoresSeeks() {
  val counter=ListeningCounter()
  val recorded=mutableListOf<Play>()
  fun sample(serial:Long, playing:Boolean, time:Double) {
   counter.sample(serial,"song",playing,time,8.0,1_000L)?.let { recorded.add(it) }
  }
  for (second in 0..7) sample(1,true,second.toDouble())
  for (second in 8..70) sample(1,true,second.toDouble())
  assertEquals("a long playback is still one play",1,recorded.size)
  sample(1,false,70.0);sample(1,true,70.0);sample(1,true,71.0)
  assertEquals("resume does not create another play",1,recorded.size)
  for (second in 0..5) sample(2,true,second.toDouble())
  assertEquals("replaying the same song starts a new playback",2,recorded.size)
  val seeker=ListeningCounter()
  seeker.sample(1,"song",true,0.0,8.0,1_000L)
  assertNull(seeker.sample(1,"song",true,7.0,8.0,2_000L))
 }
 @Test fun positionIsPublishedTenTimesASecond() { assertFalse(shouldPublishTime(10.0,10.05,false));assertTrue(shouldPublishTime(10.0,10.1,false));assertTrue(shouldPublishTime(10.0,10.02,true)) }
 @Test fun equalPowerAndMetadata() { val gains=powerGains(.5);assertEquals(1.0,(gains.first*gains.first+gains.second*gains.second).toDouble(),.00001);assertEquals("beyonce",canonical("Beyoncé")) }
 @Test fun handoverArrivesEarlyAndHolds() {
  val early=handoverGains(.25);val late=handoverGains(.75)
  assertEquals(1.0,(early.first*early.first+early.second*early.second).toDouble(),.0001)
  assertTrue("incoming is already audible a quarter in",early.second>.6)
  assertTrue("the outgoing song keeps leaving through the middle",handoverGains(.5).first>handoverGains(.75).first)
  assertTrue("the outgoing song leaves at the end",late.first<.6&&late.second>.8)
 }
}
