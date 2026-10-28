# Wave 0.1.1

**Release date: 27 October 2026.** This release turns the crossfade into a Mix, finds a real music
video for every song, links two devices with a QR code, and makes the web client installable and
usable offline. Published assets and the exact tagged revision are listed on the
[GitHub Release](https://github.com/jaime-gaming/Wave/releases/tag/v0.1.1). Native debug and
unsigned CI packages remain test artifacts, not official signed installers.

## Mix

- Two songs are analysed off the main thread: tempo, beat grid and phase, phrases, silence at the
  ends, drops and vocal regions. The handover is planned around the result instead of being a
  fixed fade.
- The overlap lasts 16 to 24 seconds, a whole number of phrases, and starts on a bar line. The new
  song arrives early and holds while the old one leaves in the second half. The low end changes
  hands once and the outgoing song loses its top through a low-pass as it goes.
- The new song enters on its first full bar rather than its first second, so a beatless intro does
  not fade in under the previous song.
- Tempo is matched within 8 % with pitch preserved, and the two songs are level matched by turning
  the louder one down, never the quieter one up.
- Files are never modified. The filter and the tempo match live on the playback graph and are
  reverted when the overlap ends.
- A small grey **Mixing** appears eight seconds before the blend and stays for the whole handover.
  The light moves across the letters themselves, and reduced motion keeps the word still.

## Video clips

- Clips are discovered automatically. Auto-generated art tracks and lyric videos are never used;
  a real music video is ranked first, and when the search only returns songs, one more request
  asks for the video by name.
- The clip fills the screen in any aspect ratio and none of YouTube's interface is visible on it.
  A paused song softens to a blurred still.
- The clip is placed where the music starts, follows the song's length, and is corrected by
  easing its playback rate instead of jumping the picture.
- The embedded player now receives the handshake it needs, so the picture actually follows the
  song instead of drifting from it.
- The chosen clip can be replaced, re-offset or removed from the song's options.

## YouTube songs

- Add music now asks where the song comes from. A YouTube song plays in YouTube's own player, with
  no download, proxy or extraction.
- When the same song is also imported as a file, the file is used: it works offline and can be
  mixed.

## Device linking

- Settings → Devices links two devices with a QR code, read by the app's own camera reader, or
  with a link. Nothing is typed or copied by hand.
- A device that has been linked before is recognised and re-confirmed without the six digits.
- Songs can be borrowed from the other device. The receiver verifies the SHA-256 before storing
  anything, and nothing already saved is deleted to make room.
- No account and no server are involved.

## Lyrics and interface

- Word-by-word lyrics are built in, with line-level timing as the fallback. The lyrics are not
  boxed, they are larger than in 0.1.0 in every view, and they keep following the sung line.
- The Wave mark and the browser tab take their colour from the cover of the playing song.
- Settings is six sections instead of one long sheet. The player bar stays where it is while a
  song plays.
- Daily mixes group the library by genre and order it by tempo and energy. Search ranks exact
  titles first.
- FLAC joins MP3, WAV, M4A and OGG, and every file is stored and played as it is.

## Phone and installation

- Web app manifest with 192, 512 and maskable icons generated from the same wave mark, an Apple
  touch icon, a standalone window and 44 px touch targets.
- An offline shell service worker caches the interface only, never audio, artwork or lyrics.
- Android phones are offered the native app once, and never asked again.
- The Android app was redesigned with the same navigation and settings sections, on a smaller
  feature set than the web.

## Checks

`npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run build:pages`,
`npm run release:check` and `npm test` (500 tests across 81 files) pass. The Playwright suite,
audible playback, real embeds and both native apps were not exercised in the preparation
workspace; see [VALIDATION](VALIDATION.md) for exactly what remains unverified.
