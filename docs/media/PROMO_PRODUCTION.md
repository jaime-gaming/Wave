# Wave product film

The current deliverable is [`wave-promo.mp4`](wave-promo.mp4): a 60-second, horizontal 1920×1080 film
at 30 fps for **Wave 0.2.0**, with English captions, a light and minimal presentation, real interface
recordings and an instrumental acoustic-piano score.

It is rendered by the `Promo film` workflow: a runner serves the built site, records the scenes with a
disposable demo library, writes the score from the same recorded piano samples and renders the film
from those recordings. Every frame is therefore of the code that produced it, and a reviewer can
compare the film with the commit rather than take it on trust. The workflow is documentation, not a
release gate.

## Storyboard

| Time      | Real interface / presentation                                       |
| --------- | ------------------------------------------------------------------- |
| 0–5 s     | Wave mark stroke animation; “Your music. In Wave.”, “Wave 0.2.0”    |
| 5–11 s    | Import, collection, albums, artists and favourites                  |
| 11–15.5 s | Daily mix browsing, Shuffle and Save as playlist                    |
| 15.5–21 s | Search with letters out of place: “Nothbound” finds _Northbound_    |
| 21–24.5 s | Playlist ordering                                                   |
| 24.5–32 s | Mix: a song taken to ten seconds before its end, joined to the next |
| 32–37 s   | Synchronized lyrics in the expanded player                          |
| 37–42 s   | Dead air at the edge of a file, the offer to skip it, Keep it       |
| 42–46.5 s | Light/dark appearance and larger text                               |
| 46.5–54 s | Two phone viewports, one in each theme                              |
| 54–60 s   | Wave 0.2.0 and the repository address; soft musical resolution      |

Presentation uses animated typography, perspective entrances, soft shadows, moving crops and paired
phone compositions. Screens are real captured pixels, not reconstructed controls. Cropping, resizing
and accelerated footage are editorial presentation, not performance benchmarks. The film shows the
**web client**, including narrow viewports; the phone-shaped frames are presentation devices, not
evidence of native Android or Windows parity.

Ten scenes are recorded and ten are used: nothing in the film is a mock-up. A scene whose controls
cannot be driven is recorded anyway, named in `capture-failures.txt` and annotated on the run; the
film still renders so the remaining scenes can be reviewed, and the note is the reason to look again.
A page error under the camera is annotated as well. The blend scene is the
app's own overlap — it is started from the real transport, and the cue, entry point and hand-over are
whatever the planner chose while the camera was rolling. The silence scene imports a fixture with six
silent seconds on each side of the tone; the notice, its wording and its two answers are the app's.

## Demo provenance

The capture script creates its own disposable browser context and IndexedDB library. It imports
original generated WAV demo fixtures and adds original covers, metadata, playlists and timed text. It
does not open or modify the viewer's library or original audio storage. Demo names and lyrics do not
identify commercial recordings. No external album-art service is used. The film's soundtrack is
separate from the demo WAV fixtures.

## Music source

The score is an original, deterministic arrangement rendered from **recorded acoustic-piano samples**,
not square-wave or chiptune oscillators. It uses soft Kawai grand-piano sustains from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL), published under
[CC0 1.0 Universal](https://github.com/sgossner/VCSL/blob/master/LICENSE).

Source directory: `Chordophones/Zithers/Grand Piano, Kawai - Legacy/Sustains/`.

Ten files are used: `GrandPno_Main_Sus_{C1,C2,C3,E3,G3,B3,D4,F4,A4,C5}_v1_rr1.wav`. Immutable Git blob
identities are pinned and checked in `scripts/fetch-promo-piano.py`. Their original license text is
fetched alongside them into ignored `.cache/audio/VCSL-LICENSE.txt`. No commercial music recording is
included. The project license and privacy/rights policies are unchanged.

The renderer preserves the samples' acoustic attacks and stereo character, varies timing and velocity
slightly, applies a quiet room tail and resolves into a fade. Final audio is normalized toward
−18 LUFS with a −1.5 dBTP target and encoded as stereo 48 kHz AAC at 192 kb/s. There is no narration.

## Reproduction

Render it from GitHub: **Actions → Promo film → Run workflow**. It needs no local tooling; the
recording, the score, the film and its checks all happen on the runner, and the result is committed to
the branch when `publish` is on (the artifact stays available for 30 days either way).

To render locally, use Node 22+, Python 3.11+, a Chromium/Playwright installation, GitHub CLI for the
public sample downloads, and FFmpeg with libx264/AAC. Do not commit sample WAVs, raw recordings,
generated fonts, intermediate frames or binaries.

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

Record the scenes, write the score and review preview frames:

```sh
node --experimental-strip-types scripts/capture-promo-scenes.ts
python scripts/fetch-promo-piano.py
python scripts/score-promo.py
python scripts/render-promo.py --preview
```

`WAVE_URL` selects the dev origin (default `http://localhost:5173`); `CHROMIUM_EXECUTABLE_PATH` can
select another compatible Chromium binary. Recordings and their timing manifest are written to
`.cache/promo-v2/`. The compositor reads those real recording timestamps to exclude page
initialization. The score and picture use explicit 60-second timelines, not wall-clock render speed.

Render and validate before replacing the published file:

```sh
python scripts/render-promo.py --ffmpeg /path/to/ffmpeg
# The workflow's check step does the same: 60 s ± 0.5, H.264 High/yuv420p, 1920×1080,
# AAC 48 kHz and under 60 MB.
/path/to/ffmpeg -v error -i .cache/promo-v2/promo-master.mp4 -f null -
cp .cache/promo-v2/promo-master.mp4 docs/media/wave-promo.mp4
```

The final container is MP4 with H.264 High/yuv420p and AAC, with its `moov` atom before media data for
progressive playback. The pipeline neither posts to social media nor tags, merges, pushes or publishes
a release.
