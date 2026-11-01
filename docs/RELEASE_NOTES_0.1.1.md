# Wave 0.1.1

**Release date: 2 November 2026.** The web client is published at
[wave.jaime-gaming.com](https://wave.jaime-gaming.com). This release turns the crossfade into a Mix
that survives real DJ material, reads whole folders, brings playlists over from other apps, finds a
real music video for every song, links two devices with a QR code, and makes the web client
installable and usable offline. Published assets and the exact tagged revision are listed on the
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

## Mix against real material

- Tempo is compared in the range where two records are actually the same speed. 174 BPM against
  87 BPM is a double-time relation, not a doubling of the song: the incoming song plays at its own
  rate and the cue says so.
- A song that drifts instead of holding a grid — a live drummer, a rubato piano intro — is not
  forced onto a beat. Below half the expected steadiness the handover becomes a long equal-power
  blend of twelve seconds, and the beat grid only decides where it starts.
- Long intros are entered rather than skipped: when the first body of the incoming song begins
  well after its grid does, the Mix starts on that first kick instead of on the top of the file.
- A genuine tempo gap is never stretched into a wobble. Wave leaves the tempo alone, still lines
  the bars up when the grid is trustworthy, and says in a word what it did.

## Folders and playlists

- Add Music takes a whole folder. It is read at any depth, the browser asks once for permission,
  and the folder is remembered so the same records can be read again with one click. Where the
  browser cannot hand over a directory at all, the choice says so rather than doing nothing.
- Playlists come over from another app without an account: paste the list, or choose the `.m3u` or
  `.csv` it exported. Wave answers how many songs are already here, which ones need a listen and
  which ones it does not have, and only the confirmed matches become a playlist — in the list's
  order, reusing songs that were already in the library, and never removing anything.

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
`npm run release:check` and `npm test` (573 tests across 93 files) pass. The Playwright suite,
audible playback, real embeds and both native apps were not exercised in the preparation
workspace; see [VALIDATION](VALIDATION.md) for exactly what remains unverified.
