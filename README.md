<p align="center"><img src="public/wave.svg" alt="Wave" width="100" height="80" /></p>
<h1 align="center">Wave</h1>
<p align="center"><strong>A home for the music you already own.</strong></p>
<p align="center">Release <strong>0.1.1</strong> · <strong>27 October 2026</strong></p>
<p align="center"><a href="#start-listening">Start listening</a> · <a href="docs/media/wave-0.1.0-promo.mp4">Watch the demo</a> · <a href="docs/RELEASE_NOTES_0.1.1.md">What's new</a></p>

![Wave Home with a local collection, album artwork and daily mixes](docs/media/home-desktop.png)

Bring your audio files, find a favorite album, and press play. Wave keeps your collection on your device. No account. No subscription. No music uploads.

## Your collection, your way

- **Find something to play.** Browse songs, albums, artists and favorites, or search your library.
- **Open a daily mix.** See the songs before playing. Play in order, shuffle, or save today's selection as a playlist you can edit.
- **Make a playlist.** Add songs, choose a cover and arrange them in your preferred order.
- **Follow the lyrics.** Add your own text/LRC, or explicitly search for a matching result. Saved lyrics work offline.
- **Mix, don't cut.** Wave analyses both songs in the background (tempo, beat grid and phase, phrases, silence at the ends, drops, vocal regions), then joins them on a bar: the new song arrives early and holds, the low end changes hands once, the outgoing song loses its top as it leaves, and the new song is cued on its first full bar instead of on its beatless intro, and the overlap is long enough to mix in — 16 to 24 seconds, three phrases at 120 BPM — tempo matched within 8 % with pitch preserved. A few seconds before the join a small grey **Mixing** appears in the player bar with a line of light crossing it, and stays for the whole handover. There is one switch and nothing to tune. Files are never modified; the filter and the stretch are playback-only and end with the transition.
- **Two devices, no account.** Settings → Devices is one **QR code each way**, or a link: point the other phone's camera at the code and the two are linked, with no numbers to copy and nothing to type. A device you have linked before is recognised and links again without asking. The other device's library appears as a list you can borrow a song from, the transfer is verified byte for byte before it is stored, and **nothing already saved is ever removed** to make room. No server, no sign-in.
- **Follow every word.** Word-by-word highlighting is built in: exact when the file carries word timestamps, a labelled estimate otherwise, and the line-level view when a lyric has no timings at all.
- **Watch the clip.** The clip is found automatically: Wave searches YouTube and keeps an actual **music video** — never the label's auto-generated art track, and a real video ahead of an "official audio" upload. It plays as a muted backdrop that fills the screen edge to edge with none of YouTube's chrome on it, and it is fitted to the song's own length — an upload with a title card, a long intro or an outro is placed where the music starts, and a clip shorter than the song starts again instead of freezing on its last frame. It has no controls of its own — the song's own bar plays, pauses and seeks it, and drift is corrected by easing the clip rate instead of jumping the picture. If discovery cannot reach any host, the link for the video can be pasted in the song's options, so a clip is never a dead end. No YouTube UI, no YouTube audio from the clip.
- **Add music from anywhere you own it.** Import files from this device, or paste a YouTube link and play the song through YouTube's own player, with its video, Wave's transport and no downloading. If the same song is imported as a file, the file is used, because it works offline and can be mixed.
- **Know what needs a connection.** Lyric search, clip discovery and adding from YouTube turn grey and say **Offline** when there is no network. Saved lyrics, remembered clips and your own files keep working.
- **Make it comfortable.** Light/dark themes, artwork colors, larger text and reduced motion. Phone controls are designed for touch, the app installs to a home screen, and the interface opens offline. On an Android phone the web client offers the native app once — download it, or keep using the web — and never asks again.

### A closer look

![A browsable daily mix with songs, Play, Shuffle and Save as playlist](docs/media/daily-mix-desktop.png)

Daily mixes use your existing genre tags, plus the tempo and energy Wave already measures for Mix, and order songs to build up rather than jump around. The same artist never plays twice in a row. No remote recommendation service is involved, and saving a mix keeps an ordinary playlist you can edit.

![Now Playing with artwork and synchronized lyrics](docs/media/now-playing-desktop.png)

<p align="center"><img src="docs/media/home-mobile.png" alt="Wave on a phone, with all five collection shortcuts visible" width="300" /></p>

[Watch the 60-second demo →](docs/media/wave-0.1.0-promo.mp4)

Lyric searches reuse saved results, coordinate requests and respect provider retry times. LRCLIB can still be temporarily busy; imported LRC files and saved lyrics work offline. Word-by-word timing comes from the lyric file when it has it, from optional extra sources (NetEase, Kugou) when you turn them on, and otherwise from a labelled estimate.

Screenshots and video show the web app with original demo artwork and lyric text. Your own collection starts empty.

## Start listening

**In a browser:** run the web app locally using the short instructions below. A hosted version can be enabled through GitHub Pages by selecting **Deploy from a branch → main → /docs** after merging (see [deployment instructions](docs/PLATFORMS.md#browser-and-github-pages)); this README does not assume a deployment is already live.

**On Windows:** the native app follows the web's layout: Home, Search, collections, playlists, Settings and Now Playing. CI produces a portable **unsigned test ZIP**; install the .NET 10 Windows Desktop Runtime and run `Wave.Windows.exe`. It is a real C#/WPF application, not a website wrapper. Device/audio integration is still under review.

**On Android:** an independent native app is available as an experimental debug build, with a smaller feature set. It is not yet a replacement for the web edition.

Check [Releases](https://github.com/jaime-gaming/Wave/releases) for published downloads and [the platform guide](docs/PLATFORMS.md) for build instructions and current differences. Release notes and attached assets identify what is published; native CI downloads are still unsigned/test-only, not official signed installers.

### Try the web app locally

Install Node.js 22.12+ or Node 24, then:

```sh
git clone https://github.com/jaime-gaming/Wave.git
cd Wave
npm ci
npm run dev
```

Open the address printed in the terminal, choose **Add music**, and select audio files. Nothing else needs configuring. For mobile development, open the server's reachable address from your phone; do not use the phone's own `localhost`.

**MP3, WAV, M4A, OGG and FLAC** can be imported, up to 200 MB per file. FLAC is stored and played as it is: lossless in, lossless out. Files are never re-encoded, resampled or converted, so a WAV, a FLAC or a high-bitrate MP3 arrives exactly as it was. Playback depends on the browser or operating system's codecs. Keep your original files: Wave is a player, not a backup service.

### A note about Windows warnings

Unsigned downloads can trigger SmartScreen or antivirus warnings. Wave uses normal, unpacked .NET files, runs without administrator rights and includes checksums; the build checks run Defender when available. **None of this guarantees zero false positives or establishes publisher reputation.** Do not disable your protection. Trusted code signing requires the maintainer's real certificate; see [Windows release preparation](docs/WINDOWS_RELEASE.md).

## Learn more

- [Release 0.1.1 notes](docs/RELEASE_NOTES_0.1.1.md)
- [Platforms and downloads](docs/PLATFORMS.md)
- [Development and tests](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Wave 1.1 specification: sync, YouTube and playlist import](docs/SPEC_1.1.md): sync and playlist import remain internal foundations
- [Privacy and data flow](PRIVACY.md)
- [All validation results and limits](docs/VALIDATION.md)

## Privacy and storage

Wave has no backend, accounts, analytics, or remote audio services. Automatic lyrics uses the public LRCLIB API, off initially and opt-in in Settings. Video-clip discovery sends only the song title and artist to public YouTube front-ends (Piped/Invidious); adding a YouTube song reads its public title and length from YouTube's oEmbed endpoint, or from a public front-end when that request is blocked. Muted clips and YouTube songs stream from YouTube, never from Wave. It sends song metadata, while the provider also sees connection information such as an IP address; downloaded text remains local. Imported files are committed immediately to this site's browser storage, without needing to play or select them. Full-file SHA-256 deduplication skips identical bytes even when filenames/dates change; legacy IDs and playlist references are preserved. Audio is retained once at original quality. Covers are compact JPEGs; lyrics persist raw text once and reconstruct parsed lines on load. Originals are never changed or deleted. Removing a track removes only Wave's stored copy and its playlist references. Playlist deletion affects no audio files. Metadata edits and custom covers are local overrides; Wave does not rewrite or export file tags.

Storage is specific to a browser profile and site origin. Clearing site data, private browsing, quota limits, or automatic storage eviction can remove the collection, playlists, and edits. **Keep your original audio files.** Wave is a player, not a backup system. A different preview URL can have a different library.

Settings → Storage → **Browser storage** reports audio, cover and lyric size estimates and origin usage/quota when supported. Import automatically requests persistent storage; **Protect stored files** can request it again. The browser may deny protection. This does not compress audio below its original size or replace a backup.

Wave installs to a home screen (web app manifest, maskable icon, standalone window) and keeps an offline copy of the interface, so it opens without a connection. Saving a song to the device's storage needs the browser, not the network; optional lookup needs internet and LRCLIB availability.

## Reference and acknowledgments

[PixelPlayer](https://github.com/PixelPlayerHQ/PixelPlayer) is a reference for local music browsing and the player experience. Wave is an independent implementation; no PixelPlayer source code, artwork, or branding is included. PixelPlayer's current proprietary license does not grant general redistribution rights.

Wave is not affiliated with, sponsored by, or endorsed by PixelPlayer or Spotify AB. Wave's design uses rounded surfaces, clear hierarchy, and expressive color inspired by Material Design principles; the web client does not use Jetpack Compose or Android Material components. The independent Android client uses Compose.

## Contributing and license

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before submitting changes.

Wave is licensed under the [MIT License](LICENSE). Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Maintained by [Jaime Gaming](https://github.com/jaime-gaming).

Public/free/open-source describes the client distribution, not permission to distribute music, lyrics or covers. No deployed Pages site, signed native package or legal clearance is claimed. Accounts/Spotify/Deezer/Firebase remain deferred.
