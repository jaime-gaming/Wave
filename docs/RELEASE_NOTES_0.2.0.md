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

## Wave's own line

- The icon pack is gone. Navigation, transport, rows, cards and dialogs are drawn in one file
  against one grid, with one stroke weight and round caps, the way the mark is drawn: the library
  is a stack of covers, settings is a mixer, pause is two capsules rather than two outlined boxes
  that smudged at small sizes.
- The `v` in **Wave** is rebuilt on the W's own trough: both arms carry the same weight and the
  letter stands on the baseline instead of leaning into a hinge.
- Android and Windows draw those same paths. `WaveIcons.kt` and the `PathGeometry` entries in
  `App.xaml` hold the strings `Glyphs.tsx` produces, so the phone and the desktop stop borrowing a
  second set of shapes, and a correction made on the web is copied to both by copying its path.

## A player that fits the screen it is on

- With a clip playing there is one shelf under the picture instead of three pieces floating over it.
  The words of the song take the left side; the sleeve with its title, artist and album takes the
  right, right-aligned and compact, and the transport runs underneath both.
- Closing the words leaves their toggle in place, so the shelf does not jump, and the open player
  loses its frame in this mode: less page padding, a one-line heading, the picture getting the rest.
- The shelf reflows rather than being rearranged by hand. On a phone the four rows stack, with the
  picture whole above them.
- Search ranks what it returns, in all three clients. A query made of the starts of words matches a
  title in any order, a name you typed comes before a longer one that begins with it, and artists,
  albums and playlists are ranked instead of listed in whatever order the library held.
- The phone's Now Playing puts the record on one side and the words on the other as soon as the
  screen is wide enough for both, and the Windows window turns its rail into a column of icons in a
  narrow window instead of squeezing the page beside it.

## A clip has room

- With a video playing, each part of the player has its own place in the grid, so nothing sits on
  top of anything else: the sleeve, the title and the transport in the left column, the words in
  the right one, and the picture in the middle.
- The picture keeps almost all of itself. The spectral wash that follows the cover no longer paints
  over the video — the light belongs to the artwork, and the video brings its own — and the veil is
  a vignette instead of a blanket.
- On a phone held upright the video is not cropped into a slice: it keeps a band of its own at the
  top, whole, and the player moves underneath it.
- Pausing stoops the picture instead of smearing it, and a missing clip is mentioned in a small note
  beside the transport rather than across the middle.
- During a mix, the arriving song's clip fades in on the same progress number as its sound.

## Linking

- Devices can be linked without a camera: a pairing code can be pasted, which is the quickest way
  between two computers and the path every other platform can use.
- `docs/PAIRING.md` writes the whole exchange down — transport, keys, six digits, frames — so
  Android and Windows can join the same network instead of inventing a second one.

## Fewer wrong claims

- A title is called a filename only when it plainly is one. Titles containing "Take", "Mix",
  "Copy" or "Final" used to be renamed by the catalogue.
- "The artist and the title look swapped" is only said when the file name itself holds them the
  other way round.
- A comma names two acts; a slash does not, so `AC/DC` is one artist again.
- Silence has to reach three seconds at the front or four at the back before Wave mentions it,
  and a missing year or genre is no longer treated as a gap.

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
