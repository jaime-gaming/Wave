<p align="center"><img src="public/wave.svg" alt="Wave" width="100" height="80" /></p>
<h1 align="center">Wave</h1>
<p align="center"><strong>A player for the music already on your device.</strong></p>
<p align="center">Version <strong>0.1.1</strong> · <strong>27 October 2026</strong></p>
<p align="center"><a href="#get-started">Get started</a> · <a href="docs/media/wave-promo.mp4">Watch the demo</a> · <a href="docs/RELEASE_NOTES_0.1.1.md">What's new</a></p>

![Wave Home with a local collection, album artwork and daily mixes](docs/media/home-desktop.png)

Add the music you own, then listen to it. Wave keeps your library in your own browser or
app, with no account, no subscription and no uploads.

## Get started

You need [Node.js](https://nodejs.org) 22.12 or newer.

```sh
git clone https://github.com/jaime-gaming/Wave.git
cd Wave
npm ci
npm run dev
```

Open the address the terminal prints, press **Add music**, pick your files, and press play.
Nothing else needs setting up.

## What you can do

- **Play your files.** MP3, WAV, M4A, OGG and FLAC, up to 200 MB each. Files are stored and
  played as they are, never converted.
- **Browse and search.** Songs, albums, artists, playlists and favourites, all from your own
  collection.
- **Start a daily mix.** Wave groups your songs by genre and plays a set that builds up instead
  of jumping around. You can play it, shuffle it, or save it as an ordinary playlist.
- **Keep the words on screen.** Wave follows the line being sung, word by word when the file
  carries timings. You can add your own lyrics or search for them, and saved lyrics work
  offline.
- **Let one song blend into the next.** Wave measures both songs, then joins them on a bar with
  a 16 to 24 second overlap. The tempo is matched, the pitch is preserved and the files on disk
  never change. A small grey **Mixing** appears a few seconds before the blend.
- **Watch the music video.** Wave looks for a real video clip for the song and plays it muted
  behind the player, full screen, with no YouTube interface showing. A clip the search gets
  wrong can be replaced from the song's options.
- **Add songs from YouTube.** Paste a link and the song plays through YouTube, without
  downloading anything. If you later import the same song as a file, the file is used.
- **Link two devices.** Settings → Devices shows a QR code. Scan it with the other device and
  the two are linked, with no account and no server. You can then borrow songs by transfer, and
  nothing already saved is ever deleted.
- **See what you have been listening to.** A Listening page shows how much you have played, the
  songs and artists that come back most, and what you heard last. Home offers the same thing as
  **Jump back in**. A song counts once you have heard half of it, the numbers never leave your
  device, and clearing them is one tap.
- **Make it comfortable.** Light and dark themes, colours taken from the artwork, larger text,
  reduced motion, and a layout built for a phone in one hand.

## Screenshots

![A daily mix with its songs and the Play, Shuffle and Save as playlist buttons](docs/media/daily-mix-desktop.png)

_A daily mix. The songs are listed before anything plays._

![Now Playing with the cover and the lyrics following the song](docs/media/now-playing-desktop.png)

_Now Playing. The sung line is highlighted and the rest stays readable._

<p align="center"><img src="docs/media/home-mobile.png" alt="Wave on a phone with all five collection shortcuts visible" width="300" /></p>

## Where it runs

**Browser.** The instructions above are all you need. You can install Wave to a home screen
and it opens without a connection once loaded. To host it yourself, see
[GitHub Pages](docs/PLATFORMS.md#browser-and-github-pages).

**Android.** A native app is available as an experimental build with a smaller feature set.
The web version offers it once on Android phones, and then stops asking.

**Windows.** A native C#/WPF app mirrors the web layout. CI produces a portable unsigned ZIP;
run `Wave.Windows.exe` after installing the .NET 10 Desktop Runtime. Device integration is
still being finished.

Downloads are on the [Releases](https://github.com/jaime-gaming/Wave/releases) page. CI builds
for Android and Windows are test builds, not signed installers.

### Windows warnings

Unsigned builds can trigger SmartScreen or antivirus warnings. Wave uses plain .NET files, runs
without administrator rights and publishes checksums, but none of that guarantees a clean
report. Please do not turn off your protection. See
[Windows release preparation](docs/WINDOWS_RELEASE.md).

## Your files and your privacy

- Everything stays on your device. There is no account, no backend, no analytics.
- Lyric search is off until you turn it on. It sends the song title and artist to LRCLIB.
- Clip discovery sends the song title and artist to public YouTube front-ends. Video and
  YouTube songs stream from YouTube.
- Imported audio is kept once, at its original quality. Wave is a player, not a backup: keep
  your original files.
- Clearing your browser's site data deletes the collection, so treat the library as a copy.

Full details are in [Privacy and data flow](PRIVACY.md) and in the storage section of
[VALIDATION.md](docs/VALIDATION.md).

## Documentation

- [Release notes for 0.1.1](docs/RELEASE_NOTES_0.1.1.md)
- [Platforms, downloads and build steps](docs/PLATFORMS.md)
- [Development, tests and release checks](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [API reference](docs/API_REFERENCE.md)
- [Validation results and known limits](docs/VALIDATION.md)
- [Changelog](CHANGELOG.md)

Screenshots and the demo film show the web app with generated demo artwork and demo lyrics.
Your own library starts empty.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.
Wave is licensed under the [MIT License](LICENSE); dependencies keep their own licences, listed
in [third-party notices](THIRD_PARTY_NOTICES.md).

Wave is not affiliated with PixelPlayer or Spotify. [PixelPlayer](https://github.com/PixelPlayerHQ/PixelPlayer)
is a reference for local library browsing; none of its code, artwork or branding is included.

Maintained by [Jaime Gaming](https://github.com/jaime-gaming).

The client is free and open source. That says nothing about the music, lyrics or covers you add
to it: those remain subject to their own rights. No hosted site, signed installer or legal
clearance is claimed here.
