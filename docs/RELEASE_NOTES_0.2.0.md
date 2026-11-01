# Wave 0.2.0

**Release date: 1 November 2026.** The web client is published at
[wave.jaime-gaming.com](https://wave.jaime-gaming.com), now served by Cloudflare Pages. This release
finishes the Mix, gives a file's silent edges somewhere to go, stops guessing about people's tags and
draws Wave's icons with Wave's own pen. Published assets and the exact tagged revision are listed on
the [GitHub Release](https://github.com/jaime-gaming/Wave/releases/tag/v0.2.0). Native debug and
unsigned CI packages remain test artifacts, not official signed installers.

## Mix

- A song arriving in a mix used to play a second at full volume before its level match landed. The
  match now reaches the deck the moment the file does, is measured where the two songs are actually
  heard together — the outgoing tail against the incoming opening — and is released over four
  seconds instead of a frame.
- Both decks share the tempo correction and the window is sixteen per cent instead of eight, so many
  more real pairs meet on the beat. The two records separate in the stereo field during the blend and
  return to the centre; no level is touched by that, so the overlap keeps exactly the power the curve
  asks for.
- **Mixing** is letters now, not a sliding gradient: each letter lights in turn, the word tightens a
  hair and its glow grows as the handover approaches.

## Files and tags

- Silent edges are measured when a song plays, mentioned once beside the player and removable. A trim
  is a pair of playback bounds — the file keeps every sample, and the editor gives the whole thing
  back. The question is never asked twice.
- An artist tag that names a duet gives each act a profile, and the song appears under both. Names
  that genuinely contain a comma stay whole.
- A title tag holding the whole line ("Artist - Song") gives up its artist when nothing was tagged;
  a zero-padded album position leaves the name; the song details panel says what a song needs in
  words, including when the artist and title look swapped.

## Lookups

- Online detail lookups are off until they are switched on, and the panel says so.
- With them on, a title the provider decorated with a featured artist still matches, a filename is
  repaired even when the album is unknown, and several styles in one string become separate genres.

## The app itself

- The error screen is written for a person: a small stopped waveform, one sentence, the two ways out.
  The exception stays in the console.
- After an hour and a half of actual playing the music stops and Wave asks whether to take a break.
  Both answers give the next question twenty minutes more room.
- On a phone, bringing the other device in is the first card under the collection.
- The navigation and transport icons are drawn by the same hand as the wordmark. With a clip playing,
  the player becomes a small column at the left and the words a narrow column at the right, leaving
  the middle of the screen to the picture.

## Hosting

- Cloudflare Pages builds `npm run build` into `dist`. `public/_redirects` and `public/_headers`
  travel with the build; the domain is set in the Pages dashboard, so no CNAME file is written. The
  Playwright mirror under `docs/` is only a mirror.
