# Wave 0.1.0 — web release candidate

Status: **unreleased; draft review**, 15 October 2026. This candidate freezes the web feature set. It does not publish a release or certify independent native editions.

## Highlights

- Local audio import with original-byte storage, content-hash deduplication, metadata/embedded-artwork checks and off-thread tag parsing. No catalogue verification or cover-download service.
- Library, dedicated Search, real artist/album profiles, favorites and ordered playlists, with local editing, custom covers and non-destructive duplicate review.
- Native-decoder playback with queue editing, shuffle/repeat, remembered positions/volume, Media Session support, one automatic Mix control and local contextual Autoplay.
- Synchronized local/embedded/optional LRCLIB lyrics. **Edit lyrics → Search online** also works before playback: inspect a match, use it in the draft and explicitly Save. Nothing is silently pasted or saved; cancellation/failure retains the draft. Provider cooldowns are shared.
- Home begins with **Your collection**, then up to three **Daily mixes** using only real local genre/artist tags. Groups are disjoint, need at least three songs and cap at thirty. Ordering refreshes by local calendar day. Fewer groups appear when the library cannot support three; no mood is invented or audio analyzed/uploaded.
- Six focused Settings menus, dark/light/system appearance, local artwork palettes, responsive mobile navigation, Larger text, reduced motion and bounded long-text layouts. The compact player replaces the removed duplicate Home session row.

## Reliability review

- Silent metadata-worker jobs expire after thirty seconds, release their resources and allow a later file to recover. Timed-out work is not repeated on the UI thread.
- Lyric searches reject pre-canceled requests, cancel oversized response bodies and retain recording/version/timeline checks and local/manual precedence.
- The lyric editor scrolls its body independently of Close/Cancel/Save, including short phone viewports. Dialog padding clicks and selection drags do not discard drafts.
- Punctuation-only artist tags cannot produce a Daily mix.
- Native build setup and Windows I/O imports are repaired. Windows controls receive rounded surfaces, explicit dark-field text/caret colors, contained long labels and wrapping playback actions. These are source/build improvements, not device-runtime certification.
- Draft saves, generated queues and UI layout changes preserve original audio and existing stored library data.

## Validation

See [VALIDATION.md](VALIDATION.md) for current complete automated-run totals, production-path smoke checks and their limits. Tests use owned tones and controlled provider fixtures, not copyrighted bundled music or live-catalogue guarantees.

## Known limitations / review gates

- Browser codec/storage/Media Session and audio policies vary. Mix is not beat matching or guaranteed gapless/clipping-free playback; Autoplay can be switched off.
- Daily mix quality depends on local tags. A single artist with missing genres is labeled artist-based, not asserted to be a musical style. These mixes are temporary selections, not automatically saved playlists; ordinary queue/repeat/Autoplay behavior applies.
- Live LRCLIB availability/coverage is not verified in the restricted build workspace. Lyrics/artwork rights and deployment-specific legal compliance are not certified.
- The main JavaScript bundle retains Vite's advisory size warning. No device/FPS benchmark or formal accessibility conformance claim is made.
- Android and Windows are independent native source foundations with incomplete web parity; their build/runtime review remains separate. No signed packages are released here.
- This draft must pass hosted checks and human review before merge, tagging or deployment.
