# Wave 0.1.0 — product film

The current deliverable is [`wave-0.1.0-promo.mp4`](wave-0.1.0-promo.mp4): a 60-second, horizontal 1920×1080 film at 30 fps, with English captions, light/minimal presentation, real interface recordings and instrumental acoustic-piano music. It replaces the earlier short silent demonstration.

## Storyboard

| Time    | Real interface / presentation                                       |
| ------- | ------------------------------------------------------------------- |
| 0–5 s   | Wave mark stroke animation; “Your music. In Wave.”                  |
| 5–12 s  | Import, collection, albums, artists and favorites                   |
| 12–19 s | Daily mix browsing, Shuffle and Save as playlist                    |
| 19–26 s | Search, song metadata editor and playlist ordering                  |
| 26–35 s | Expanded player, queue reordering, Mix and local Autoplay           |
| 35–44 s | Filled synchronized lyrics; lyric search, preview and explicit save |
| 44–54 s | Light/dark appearance, text size and mobile-viewport compositions   |
| 54–60 s | Wave 0.1.0 and repository address; soft musical resolution          |

Presentation uses animated typography, perspective entrances, soft shadows, moving crops, a queue-panel focus transition, a lyric close-up and paired mobile compositions. Screens are real captured pixels, not reconstructed controls. Cropping, resizing and accelerated footage are editorial presentation, not performance benchmarks. The film shows the **web client**, including narrow viewports; the phone-shaped frames are presentation devices, not evidence of native Android or Windows parity.

## Demo provenance

The capture script creates its own disposable browser context and IndexedDB library. It imports original generated WAV demo fixtures and adds original covers, metadata, playlists and timed text. It does not open or modify the viewer's library or original audio storage. Demo names and lyrics do not identify commercial recordings.

The lyric editor scene uses a controlled response containing the original demo text to demonstrate search → preview → draft → explicit Save. It is not a recording of a verified live LRCLIB response, nor a claim of live-service availability. No external album-art service is used. The film's soundtrack is separate from the demo WAV fixtures.

## Music source

The score is an original, deterministic arrangement rendered from **recorded acoustic-piano samples**, not square-wave/chiptune oscillators. It uses soft Kawai grand-piano sustains from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL), published under [CC0 1.0 Universal](https://github.com/sgossner/VCSL/blob/master/LICENSE).

Source directory: `Chordophones/Zithers/Grand Piano, Kawai - Legacy/Sustains/`.

Ten files are used: `GrandPno_Main_Sus_{C1,C2,C3,E3,G3,B3,D4,F4,A4,C5}_v1_rr1.wav`. Immutable Git blob identities are pinned and checked in `scripts/fetch-promo-piano.py`. Their original license text is fetched alongside them into ignored `.cache/audio/VCSL-LICENSE.txt`. No commercial music recording is included. The project license and privacy/rights policies are unchanged.

The renderer preserves the samples' acoustic attacks and stereo character, varies timing/velocity slightly, applies a quiet room tail and resolves into a fade. Final audio is normalized toward −18 LUFS with a −1.5 dBTP target and encoded as stereo 48 kHz AAC at 192 kb/s. There is no narration.

## Reproduction

Use Node 22+, Python 3.11+, a Chromium/Playwright installation, GitHub CLI for public sample downloads, and FFmpeg with libx264/AAC. Do not commit sample WAVs, raw recordings, generated fonts, intermediate frames or binaries.

```sh
npm ci
npx playwright install chromium ffmpeg
python3 -m venv .venv
. .venv/bin/activate
pip install av pillow numpy scipy soundfile fonttools brotli
```

Start the web server in a separate terminal:

```sh
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Capture, compose the score and review preview frames:

```sh
node --experimental-strip-types scripts/capture-promo-scenes.ts
python scripts/fetch-promo-piano.py
python scripts/score-promo.py
python scripts/render-promo.py --preview
```

`WAVE_URL` selects the dev origin (default `http://localhost:5173`); `CHROMIUM_EXECUTABLE_PATH` can select another compatible Chromium binary. Recordings and their timing manifest are written to `.cache/promo-v2/`. The compositor reads those real recording timestamps to exclude page initialization. The score and picture use explicit 60-second timelines, not wall-clock render speed.

Render the candidate into ignored storage, then validate it before replacing the public file:

```sh
python scripts/render-promo.py --ffmpeg /path/to/ffmpeg
/path/to/ffmpeg -v error -i .cache/promo-v2/promo-master.mp4 -f null -
# Inspect duration, codecs, frame count, aspect ratio, audio levels and fast-start.
# Review representative decoded frames and watch/listen before publication.
cp .cache/promo-v2/promo-master.mp4 docs/media/wave-0.1.0-promo.mp4
```

The final container is MP4 with H.264 High/yuv420p and AAC, with its `moov` atom before media data for progressive playback. The pipeline neither posts to social media nor tags, merges, pushes or publishes a release. The older `scripts/create-promo.ts` is retained only as the earlier short-film pipeline and can overwrite the same destination; use the commands above for this version.
