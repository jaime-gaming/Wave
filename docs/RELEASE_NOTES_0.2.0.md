# Wave 0.2.0

**Release date: 3 November 2026.** The web client is published at
[wave.jaime-gaming.com](https://wave.jaime-gaming.com), served by Cloudflare Pages. Android and
Windows are built from the same interface and the same assets; their CI packages are debug builds,
not signed installers. The exact tagged revision and the published assets are listed on the
[GitHub Release](https://github.com/jaime-gaming/Wave/releases/tag/v0.2.0).

This release is mostly about three things people kept noticing: the join between two songs, the
picture behind the player, and the box you type into when you are looking for something.

## The Mix

Two songs now meet the way a person with two turntables would join them: the new record comes in on a
bar, both play for a few bars, and the old one leaves with its bass closing and its top rolling off.
The overlap lasts twelve to twenty-four seconds when the tempos are close, and gets shorter when they
are far enough apart that the two pulses would drift — no song is ever sped up, slowed down, or bent
to fit another.

- The new song enters where it is already playing. An intro that ends in a held chord or a filtered
  beat is not an arrival, so Wave waits for the first bar that sounds like the record.
- The two decks are matched on the point where they are actually heard together, not on the average
  of both songs, and the arriving deck is silent until the blend takes it over. The half-second of
  full volume at the start of a blend is gone.
- In its last ten seconds a song can end when the music ends: if there is nothing left to hear, the
  next one comes in instead of the room going quiet.
- The letters of **Mixing** carry one light, travelling across the word.

## The videoclip

- Everything Wave draws is on top of the picture: the sleeve and the song's text in the top-left
  corner, the words of the song in the bottom-right, one compact transport along the foot. The video
  reaches every edge of the window — no panel, no frame, no square sitting darker than the rest.
- A still is not a clip. Official audio, art tracks, lyric videos and "cover art" uploads are skipped,
  because Wave already shows the sleeve and reading a second set of lyrics over a frozen frame is
  worse than no picture.
- A clip can be placed before the song as well as after its start: the offset takes negative seconds.
- YouTube's own interface can never appear over the picture, and a paused clip is softened so its
  player cannot be read through it.

## Search

- A letter in the wrong place no longer means "not in your library": `nightclal` finds _Nightcall_,
  `midnigth` finds _Midnight City_, on the website, the phone and the Windows window. A near miss
  always ranks below anything spelled correctly, and noise still finds nothing.
- Artists, albums and playlists are ranked rather than listed, so the name you typed comes first.
- A lyrics service that spells a title with an edition word the file left out still matches; a live
  take or an acoustic version remains a different recording.

## Silent edges

Dead air is now measured against the loudest tenth of the song, has to hold for a third of a second
before a lead-in counts as finished, and is never trimmed past twenty seconds a side. The offer needs
two and a half seconds at the front or four at the back, it appears over the bar and inside the open
player, and accepting it only changes where playback starts and stops — the file keeps every sample.

## Smaller things worth knowing

- Bringing a library over is in Settings → Library as well as behind the playlists shelf.
- Remix keeps four weeks, with the older weeks listed under the last seven days.
- Autoplay remembers the last twenty-four songs instead of the last twelve and steps back from an
  artist it has just played.
- Icons are drawn in one place against one grid, and Android and Windows carry the same paths.
- The phone card and the daily mixes on the home page share one spacing rhythm instead of sitting
  against the heading above them.
- Every platform links to every other by QR code or by a pasted code.

## What this release is not

- No iOS application.
- The blend described above is the web client's. The phone and the desktop still join two songs with
  a plain overlap; bringing them the same engine is the next piece of work, not a claim of this
  release.
- No account, no upload, no listening profile leaving the device.
- No signed installers: the native packages produced by CI are debug builds for testing.

## Upgrading

An existing library opens unchanged: the database is migrated forward, playlists, favourites, saved
album orders, local lyrics and per-song clips keep their places, and nothing in your files is
rewritten. Silence trims saved by an earlier version remain exactly as they were saved.
