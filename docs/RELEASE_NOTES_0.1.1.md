# Wave 0.1.1

**Release date: 27 October 2026.** This release fixes YouTube songs that never started, makes the interface stop explaining itself, enlarges the lyrics, and adds an installable, offline-capable web app. Published assets and the exact tagged revision are listed on the [GitHub Release](https://github.com/jaime-gaming/Wave/releases/tag/v0.1.1). Native debug/unsigned CI packages remain test artifacts, not official signed installers.

## Songs play

- A YouTube song no longer depends on a single endpoint. YouTube's own oEmbed reply is blocked by CORS in a browser, so title, channel and length now come from the first of four sources that answers: YouTube oEmbed, noembed, Piped, Invidious. Five seconds each, nine seconds for the chain, and the video id is validated before any request.
- The embed is told to play as soon as the song starts and keeps being told until it confirms, instead of waiting for a message that a slow or restricted embed may never send. The embed URL is fixed at mount, so a re-render can never reload the video and start it from zero.
- A video that refuses to be embedded now says so, with a link to open it on YouTube, instead of staying silent.
- A library row whose audio is no longer in browser storage says so instead of appearing to play nothing.
- Notes that actually help stayed: importable formats, "Tap a line to seek", the queue's reorder hint, the timing-offset explanation, the Add-music privacy line and the storage warning. Only the explanations of how things work internally were removed.

## A quieter interface

- Mix is one switch. The overlap, the tempo match, the entry point and the bass swap are chosen per pair of songs, and the bar count now follows the tempo so a blend lasts about eighteen seconds.
- Removed from the interface: the last-handover panel, the BPM readout, the daily-mix tempo line and ordering sentence, the interpolation notes under the lyrics, the settings essays and the paragraphs that were not options.
- Kept, because they tell you something you need: which formats can be imported, that lyric search sends only metadata, that lyric search can be retried, that clips are stored on this device, that browser storage can be evicted, and which sources are unofficial.
- Lyrics are larger everywhere: the panel (23–33 px), Now Playing (21–32 px), the cinematic view (26–52 px) and phones (23–32 px), with the small-screen and landscape rules raised to match.

## Video clips

- Clips are found automatically. Pasting a link is gone; when no clip matches, the panel says so and offers another search.
- A video whose owner does not allow embedding says so and links to YouTube, instead of staying silent.

## Phone and installation

- Web app manifest with 192, 512 and maskable icons generated from the same wave mark, Apple touch icon, standalone display, safe-area padding, 44 px touch targets, no hover-only affordances and momentum scrolling.
- An offline shell service worker caches the interface only — never audio, artwork or lyrics.
- Android: edge-to-edge with drawing-safe insets and Mix as a single switch.

## Checks

`npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build` and `npm test` pass. The Playwright suite and audible playback were not run in the preparation workspace (no browser engine and no access to YouTube); see [VALIDATION](VALIDATION.md) for exactly what remains unverified.
