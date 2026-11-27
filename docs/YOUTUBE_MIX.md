# YouTube and Mix: investigation

Mix currently applies only when both sides resolve to local audio. If either side
is an embedded YouTube video, Wave waits for the outgoing song to end and then
advances normally. If a row resolves to an actual local copy, that local copy can
participate in Mix. No YouTube audio is downloaded or analyzed.

## What needs solving

The previous experimental handover started the next embed silently to find out
when it was ready. That could consume the start of the incoming song before the
listener heard it, and the independent embed and audio clocks could drift. A
buffering, blocked-autoplay or unavailable video must never fade out the outgoing
song or skip an opening. Pause, seeking, queue edits, rapid track changes and
errors must also cancel cleanly and restore both volumes.

YouTube's [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
documents `cueVideoById`, state-change and autoplay-blocked events, and volume
control. Cueing prepares the player but does **not** request the video until play
or seek, so an `onReady` or cued event alone is not evidence that playback will
start in time. A possible experiment is to cue without playing, start at zero
only inside the final window, and fall back to normal sequential playback when
readiness is uncertain. This is a hypothesis, not a working or verified Mix.

Before trying simultaneous players, review YouTube's current
[Developer Policies](https://developers.google.com/youtube/terms/developer-policies),
including restrictions on background/hidden players and preserving the player
experience. Audit Wave's existing compact-player behavior against those policies
separately; this note does not certify it. Test web and native WebViews on actual
mobile devices, with user activation, buffering, errors and interruptions. Keep
the safe sequential path until both policy and audible results are verified.
