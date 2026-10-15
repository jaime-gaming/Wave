# Wave Interface Design

## Direction

Wave follows the Material 3 / Material Expressive direction of the original project documentation, with [PixelPlayer](https://github.com/PixelPlayerHQ/PixelPlayer) as the visual reference. The web interface adapts that language to larger screens; it is not a marketing page and is not a pixel-for-pixel copy of an Android application.

The approved direction is a library-first interface, rounded tonal surfaces, clear type hierarchy, large playback controls, and album artwork as the visual focus. Do not introduce promotional banners, decorative records, invented recommendations, or filler collections.

## Layout

### Desktop, wider than 1100 px

- A compact navigation rail contains Home, Search, and Library.
- The main library has a blue tonal header, a large page title and category pills. There is no collection filter in Library; the search composer belongs only to Search.
- A dark, rounded library surface holds playback actions, sorting, and song rows or album groups.
- Keep the library full width beside the rail. A compact fixed bottom player contains the current track, transport, progress, volume, modes, and queue access where space allows. Clicking track information opens Now playing across the full viewport, with artwork/credits on the left, a lyric reader on the right and an independent bottom transport.

### Tablet, 701–1100 px

- Keep the navigation rail and main library.
- Keep the compact floating player; hide secondary bar controls when space is constrained.
- Open the full now-playing view from the compact player's track information.

### Mobile, up to 700 px

- Use a three-destination bottom navigation bar: Home, Search, Library.
- Position a compact player immediately above navigation.
- Keep the library title, settings/import actions, and horizontally scrollable category pills.
- Put text search on the Search screen rather than taking space away from the song list.
- Hide desktop-only columns and keep artwork and song information visible. Use a circular overflow button for song actions on mobile, opening song options for favorites, playlist membership, opt-in editing, and confirmed library removal. The same menu is available on desktop.
- Open Now Playing as an opaque, bounded full-viewport dialog without outer scrolling. Stack artwork/controls on narrow screens; scale spacing and artwork to available height. Prioritize the active lyric and essential controls on short screens. Keep collapse/queue reachable, and never show the library through the player.

Home contains collection counts/shortcuts, actual recently imported albums and songs, playlists, and artists. The compact player owns current-session access; do not duplicate it in Home. Local daily mixes follow Your collection only when actual tags support coherent groups. Search searches the whole local collection. Library contains Songs, Albums, Artists, Playlists, and Favorites. Do not expose empty, unimplemented destinations such as equalizer controls. The Lyrics disclosure below playback controls starts expanded; no separate captions-toggle button is needed.

### Artist destination

Use rounded artist cards with local initials, song/album counts, and a small stack of owned album covers when available. Do not treat album covers as artist photographs or invent biographies, verification badges, followers, or remote content. A profile contains a back action, name, known duration/counts, direct Play/Shuffle, an album shelf, and songs. Keep the back action available if editing/deletion empties a profile. Artist/album pairs identify albums; equal titles from different artists remain separate.

## Visual system

### Color

Dark-theme foundation:

| Role                         | Value     |
| ---------------------------- | --------- |
| Background / library surface | `#10141f` |
| Library header               | `#0b2c51` |
| Song / navigation container  | `#1d2230` |
| Higher container             | `#282e3e` |
| Primary                      | `#b0c7ff` |
| On primary                   | `#092e62` |
| Primary container            | `#324773` |
| Secondary container          | `#484168` |
| Primary text                 | `#e3e5f1` |
| Secondary text               | `#acb2c4` |

Light and system themes use equivalent tonal roles, not inverted dark colors. CSS variables define the palette. Surfaces use tonal colors; avoid arbitrary decorative gradients, large shadows and border-heavy dashboard styling. A low-opacity tonal light layer may respond to measured source amplitude; it must not become an unrelated looping decoration.

Now playing uses a local, coarse artwork color sample to derive its tonal background and controls. The palette keeps fixed lightness ranges for legible text. Missing, grayscale, or unreadable artwork uses a neutral blue-tonal fallback. Sampling is not a remote service and does not recolor the original artwork.

### Typography

Use self-hosted Nunito Sans Variable. Fonts are bundled with the application, not fetched from a font CDN.

- Desktop page title: 68 px; mobile: 56 px.
- Section titles: 24–25 px.
- Song title: 16 px on desktop, 15 px on mobile.
- Secondary track information: 14 px on desktop, 13 px on mobile.
- Primary action labels: 14–15 px.
- Avoid tiny all-caps labels, tracking-heavy headings, and repeated slogans.

### Shape and spacing

Use a small set of shapes rather than a different radius for every element:

- Major desktop surfaces: 36 px radius.
- Dialogs, artwork, and library surfaces: 28–32 px radius.
- Song rows: 24–26 px radius.
- Category pills and tonal buttons: fully rounded.
- Playback controls: circles; the active pause button changes to a rounded square.

Use approximately 8 px spacing increments. Song rows are 84–88 px tall, with 52–56 px artwork. Preserve room for real track titles instead of decorating the row.

## Content and states

Use direct interface language: Library, Add music, No songs yet, Now playing, Queue is empty. State what the user can do; do not add lifestyle or subscription advertising.

An empty library is genuinely empty. A missing cover uses a neutral music-note placeholder, not invented album art. Unsupported media and failed storage produce visible errors. Controls that cannot operate are disabled.

## Interaction and accessibility

- Use labeled semantic buttons and native modal focus containment/restoration.
- Keep a visible focus outline and respect reduced motion.
- Preserve the selected destination and category visually and semantically.
- Search supports Ctrl/Command K, including from a focused button.
- Category pills scroll horizontally on narrow screens instead of shrinking into unreadable labels; selection stays in view after switching or resizing.
- Reserve bottom space with app-shell padding, not a collapsible final-child margin, so content can scroll above fixed playback/navigation on every screen. Notifications must sit above the bar, never intercept its controls.
- The full player and queue remain usable without dismissing the active playback session.
- Touch targets should remain at least 44 px where possible; dense row actions may be narrower and need further real-device review.

## Motion language

Material 3 Expressive distinguishes spatial spring motion from non-bouncing visual effects [1](https://m3.material.io/styles/motion/overview/how-it-works). Wave adapts that principle to the web with Motion for React; these are Wave tokens, not native Android/Compose tokens.

- Spatial default: spring stiffness 420, damping 26, mass 0.9. Used for view entry, list layout, dialog movement, and playlist press/hover feedback.
- Spatial fast: stiffness 650, damping 29, mass 0.7. Used for selected navigation/category indicators and control shape.
- Effects: 160 ms with easing `[0.2, 0, 0, 1]`, used for opacity. Do not spring opacity past its valid range.
- Shared-layout selection follows the active destination rather than flashing on/off.
- View surfaces use a short effect exit before a spatial entry; old surfaces are inert. Artist cards enter with a capped stagger and reposition with layout springs. Album/collection actions use subtle lift and press feedback. Song rows enter gently, reposition when ordered, and exit before removal. Exiting content is inert so it cannot be activated or reached by assistive technology.
- The main play/pause control changes between circular and rounded-square forms. Playback glyphs crossfade/slide independently of button shape, using consistent pixel radius units. Artwork changes crossfade; the seek wave and small equalizer indicate actual playback rather than decorate every idle row.
- Favorite feedback is brief. Avoid continuous animation except meaningful playback indicators.
- Settings exposes **Animations**, default on. **Both** the off setting and the system reduced-motion preference remove spatial/decorative motion. CSS and JavaScript honor the same preference. Do not make motion necessary to understand state.

## Playlist and editor surfaces

Playlist cards reuse album-group surfaces. A custom cover takes priority; otherwise use the first song's cover, then the neutral placeholder. Detail views keep the rounded library surface, cover, title, optional description, and direct Add songs/Edit/Delete actions. Saved order has an explicit sort option. Move-up/down buttons keep reordering usable without drag gestures.

Library editing is deliberately off by default. Settings explains the opt-in. Song options expose the editor only when enabled, and playlist dialogs gate descriptions/artwork while keeping basic naming available. Editors use labeled fields, a local artwork picker, save/cancel states, and inline errors. Song edits explain that originals are unchanged and offer restoration of the first imported information. Disable saving while a cover is being processed or a write is pending.

Destructive actions require confirmation. Removing a playlist or membership is explicitly distinct from deleting a stored song. Failed writes do not silently dismiss editors or pretend changes were saved.

## Validation

Check empty and populated libraries, tagged and untagged artwork, dark/light themes, long titles, and widths of 320, 390, 768, 1024, and 1440 px. Browser tests cover navigation, the compact/full player, queue access, editor gating, artwork errors, playlist persistence, motion preferences, focus, and overflow in addition to playback behavior.

The reference screenshots are inspected during development but are not shipped with Wave. Original implementation, licensed fonts/icons, and the user's own artwork are the only visual resources in the app.

## Lyrics and customization

Lyrics appear beside or below playback controls in an initially open, accessible button-controlled disclosure. Artwork remains visible and transport stays available. Use a rounded tonal surface, a complete scrollable lyric document with a centered sharp active verse and softly blurred neighbors, active timestamp emphasis, paging/follow controls and seekable synchronized lines. Missing lyrics show the requested friendly “¡Oh, oh!” message with a clear import/paste action, never fabricated lyrics. Plain text is labeled **Text lyrics**, distinct from seekable synchronized lines; keep timestamp precision descriptions in accessible text/tooltips rather than permanent technical captions. Fixed queue/collapse controls remain reachable on narrow/short screens.

A manually chosen artist portrait replaces initials/album stacks across gallery, Home and detail, cropped to the existing round avatar. Keep the photo-edit action secondary to Play/Shuffle; use a separate local photo picker, not album artwork or invented verification/biography content.

Collection reordering uses rounded rows with drag handles, cover/title/artist and accessible up/down alternatives. Use spatial reordering motion and respect reduced motion. Keep saving explicit, errors recoverable and pointer drag confined to the handle. Crossfade is an audio setting, independent from decorative animation preferences.

### Expressive overlap and lyric focus

Use distinct spatial spring schemes for fast presses/selection and slower content entry. Cards enter with restrained rise/scale, navigation icons respond to selection, and mini-player artwork overlaps on source changes. Do not turn idle surfaces into looping decoration.

During real audio overlap, fade the incoming cover over the outgoing cover using the engine's actual fraction. Do not rotate or scale the covers, display a current-to-next banner, draw a mix progress meter or add a compact-bar transition indicator. The audio fade and source information change are sufficient. Completion/cancellation cleanly returns to a single cover.

The lyric focus shifts gently to the active timestamp with readable neighboring lines and manual paging/follow controls; only the lyric reader may scroll; the outer listening stage stays fixed. The letters themselves fill in reading order across words and wrapped text; no bars, underlines or separate elapsed indicators are drawn. Enhanced LRC uses supplied word timestamps; unknown segment ends use the following line/native duration as a fallback. Ordinary LRC interpolates the supplied line interval, using native duration for the final line, and must not be described as exact word-timed karaoke. Seeking recalculates it, pausing freezes it, plain text never gains artificial synchronization. Quick ±100 ms controls supplement the editor. LRCLIB results display provenance/offline availability. Distinguish searching, actual missing matches, instrumentals and connection failures. Keep manual LRC/paste available and never invent text or timing.

Settings explains metadata-only external lookup, its persistent opt-out and browser storage accounting/protection. Unknown artists require metadata rather than guessed matches.

### Home, navigation and collapsed playback

At desktop widths of at least 1100 px, use a 208 px labeled sidebar with a quiet brand, shared selection pill, collection shortcuts/counts and Settings at the bottom. Tablet widths retain an 88 px rail; phones keep a 68 px bottom navigation. Hidden collection shortcuts must not obstruct mobile content.

Home starts with compact real collection counts, then up to three tag-based local daily mixes and an album shelf. At widths of at least 1280 px, recent songs and playlist/artist panels form two columns; narrower screens stack them. Mobile count shortcuts scroll horizontally with snap hints. Do not add promotional banners, invented recommendations or an oversized now-playing card.

The closed player is 64 px tall with a 40 px cover. Keep its title/artist, playback controls and desktop seek/volume/queue functionality usable, but leave large artwork and controls to the explicitly opened full-screen player. Reserve scroll space and safe-area clearance for the smaller player and mobile navigation.

## Three-platform update

Home is the initial web page; Settings is now a full page, not a dialog. Lyrics starts open in a collapsible section each time Now Playing expands or the song changes. Redundant source/playback status text is removed. The original curved W mark replaces generic waveform bars. Online automatic lyrics is optional/off initially, while manual one-song lookup remains available. Exact/search requests validate artist/title/duration, identify the client, and honor provider cooldowns; availability cannot be guaranteed. Crossfade uses incoming media time and equal-power gains, not elapsed wall time. Duplicate cleanup merges only confirmed byte-identical records, preserving references; same-name groups are reviewed non-destructively.

Separate native Android (Kotlin/Compose) and Windows (C#/WPF) source implementations exist; prior web-only scope statements apply to the web architecture, not the entire project. They are early, uncompiled in this workspace and lack full web parity. [PLATFORMS](PLATFORMS.md) is the authoritative build/status matrix. [Privacy](../PRIVACY.md) describes data flows, rights and unresolved public-release obligations.

## Listening session and inactivity

Save queue/order, current selection, repeat/shuffle and per-song positions locally. Restore paused after IndexedDB hydration and seek only after native metadata is available. Track deletion must prune references without interrupting unrelated playback. Failed or unavailable browser storage must not break listening.

After 30 seconds without activity while audio is playing (not buffering), replace the normal view with an opaque immersive stage. Put a large song title behind the artwork and keep lyrics prominent, without buttons, progress bars or editing instructions. Cinema lyric rows are read-only, not focusable seek buttons. Do not enter over an editor/queue dialog or in a hidden tab. Pointer movement/down, touch, keyboard and wheel restore the previous compact/expanded view immediately; none of these actions restarts audio.

Song title/cover actions in collection rows play. Artist/album metadata actions navigate instead, with no accidental row-play propagation. Player artist/album links preserve playback and navigate to the corresponding local page.

## Palette and listening redesign

Use a cover/header plus a large lyric reader above an independent bottom transport dock. Desktop puts credits below artwork beside the lyric reader. Phones keep a rounded cover/metadata row above the reader, reducing it on short screens; collapsing lyrics centers and enlarges the record. Short landscape uses the two-column stage instead of squeezing three vertical regions. Collapsing lyrics removes the unused column and enlarges the song stage. Seek, times, previous/play/next, repeat/shuffle/favorite and volume must have real, unoccluded hit targets. Do not rely on hidden overflow as evidence of a working layout.

Use artwork hue across navigation, content surfaces and controls, with separate dark/light luminance roles. Native View Transitions reveal the newly toned document through a circle expanding from bottom center. Respect disabled/system-reduced motion; unsupported browsers change directly.

Lyrics are not ellipsized. The active verse fits its available reader height; inactive lines blur gently, but keyboard focus/hover removes blur. Normal mode retains the complete document and internal scrolling. Cinema shows a full current verse with neighboring context; no-lyrics cinema centers music metadata and never shows a missing-lyrics panel. Browser visibility and actual document focus gate entry, and blur exits immediately.

Playlist icons are deterministic SVG compositions using the playlist identity/name and a bounded local sample of member cover colors. The same generated identity appears on Home, collection, detail and playlist picker. Uploaded covers win, and no fabricated artist photographs or new stored media are introduced.

## Dedicated discovery and identity refinement

Search is a destination, not a repeated field on Home or Settings. Its composer, category chips, real collection shortcuts and grouped results preserve the existing tonal surfaces and rounded Wave language. Search words ignore accents, case and punctuation and match in any order; there is no remote recommendation feed or invented listening history. Library has no repeated filter field. Search remains global; collection ordering always uses the complete collection.

Playlist covers use original deterministic musical-symbol vectors, a small name signature and locally sampled member-color gradients. Never replace user artwork. Artwork source changes use a restrained spring rise/scale/rotation; opening lyrics uses a short opacity/position effect. Play state morphs the main transport shape. Search category/card presses respond without continuous decorative loops. Both motion preferences suppress these effects.

## Expressive playback refinement

Treat the record as a layout group: cover and credits stay together while the reader occupies a distinct rounded tonal surface and transport owns the bottom shelf. The cover is an accessible play/pause action. In the compact bar, song information opens the full player; artist/album navigation belongs to the expanded metadata and collection rows, not the compact artist label. Short layouts prioritize complete visible controls and internally scrollable lyrics. Collapsing the reader centers the whole record group, not just its cover.

During initial hydration, animate the original W into a line, a volume-like wave and back to W. Keep the mark brief, with no slogans or forced dwell under reduced motion. Press feedback is a local pointer-origin ink ripple; it is clipped to its control, noninteractive and removed on completion or motion opt-out. State layers and button shape changes supplement spatial springs. Native `matchMedia` changes feed `useWaveMotion` through `useSyncExternalStore`, so system motion settings apply immediately.

Artwork tones exist only during playback. Pausing restores the neutral Wave roles. The moving background derives energy from actual local source samples, not random CSS keyframes or guessed BPM; seeking and volume/mute affect it. Disable it in hidden/unfocused tabs, when buffering, on pause and under either reduced-motion setting. Do not change the playback audio graph to produce a visual effect.

The expanded stage uses one owned stylesheet/namespace rather than accumulating transport overrides. Seek wave geometry follows actual track width, with a bounded separate thumb and a fixed-period seamless translation; do not stretch a fixed-width animated SVG inside the filled percentage. Center playback glyphs in their own bounded slot throughout transitions. Keep artist/album controls usable without allowing their text to expand the stage.

Show a quiet provider link, not “saved offline”, word-timing jargon or a permanent milliseconds row. Follow and editing remain recognizable icon controls; **Adjust lyric timing** reveals the timing popover on demand. The measured tonal light must be perceptible behind both normal and immersive content, never above hit targets, and must disappear during silence/mute/pause or reduced motion.

## Diffuse illumination and contextual sheets

The background is illumination, not waves: use restrained radial falloffs with no SVG silhouettes, sharp contours, blur filters or screen blending. Low/mid/high frequency bands move separate soft light sources; do not label them as actual vocal or instrument isolation. Larger movement comes from continuous energy-driven phase, not a random beat loop. Silence, mute, pause and motion/visibility rules retain priority.

Use the same curved seek geometry in the compact bar; narrow screens get a slim track contained by the bar rather than an extra status panel. Queue belongs to the listening system: a rounded tonal desktop side sheet/mobile bottom sheet, quiet duration/count, independent list scrolling, legible current state, and real add/remove actions. Preserve song position when selecting the current row.

The absence view must actually hide normal playback controls, not merely make them inert. Give artwork, song credits and the complete current verse distinct quiet regions, with blurred neighboring context and a restrained entrance. Keep source playback independent of entrance, wake and resizing.

Timing adjustment must stay linked to following/recentering, show the saved value, offer reset and recover from storage errors. Fit the verse before the single centering operation to avoid a visible snap over a smooth scroll. Palette transitions must not apply stale colors after rapid track changes or pause; reading Privacy & Rights uses the same Wave roles, without music-driven animation or changes to explanatory/legal text.

### Queue editing, contextual actions and mix color

Queue order changes immediately through handles, up/down buttons or Alt-arrow keys. Keep the selected source and elapsed position stable; announce keyboard moves and provide a clear Done state. The queue's order is independent of playlist and album order.

Right-click menus are rounded tonal top-layer surfaces, not default browser styling. Clamp their untransformed dimensions before entrance so all animation frames fit the viewport; reclamp after resize. Arrow/Home/End skip disabled actions, Escape/Tab close and focus returns to the originating control. Preserve native behavior for selected text, editable fields, links and Shift-right-click. Destructive library actions still use the existing confirmation flow.

During overlap, interpolate artwork hue via its shortest arc and saturation from the outgoing to incoming recording using actual media progress. A single restrained bloom may accompany the handover. Do not create a View Transition every frame, add mix meters or alter audio for visual effects. Pause restores neutral roles; reduced motion switches directly. Hide the whole underlying application during absence, including bottom UI and any descendants with explicit visibility.

### Larger-text candidate review

Appearance offers a persisted Larger text switch for collection labels, song titles, credits and explanatory copy. Mobile edit/search inputs use at least sixteen-pixel text to avoid unwanted focus zoom; viewport markup continues to allow user zoom. Touch targets and visible focus are reinforced, including short-screen dialogs. Reader/stage geometry remains viewport-bounded. These are tested usability improvements, not a formal accessibility conformance certification.
