# Third-party notices

Wave's own source is licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses.

## Nunito Sans

The application bundles Nunito Sans Variable through `@fontsource-variable/nunito-sans`.

Copyright 2016 The Nunito Sans Project Authors (<https://github.com/Fonthausen/NunitoSans>).

Nunito Sans is licensed under the SIL Open Font License, version 1.1. The full license is included in [public/licenses/nunito-sans-OFL.txt](public/licenses/nunito-sans-OFL.txt) and distributed with production builds under `/licenses/nunito-sans-OFL.txt`.

## Motion

The application uses Motion for React for spatial springs and visual transitions. Motion, Framer Motion, motion-dom, and motion-utils are MIT-licensed. Their full copyright and license notices are included in [public/licenses/motion-MIT.txt](public/licenses/motion-MIT.txt) and distributed under `/licenses/motion-MIT.txt`.

## Other runtime dependencies

| Dependency          | License |
| ------------------- | ------- |
| React and React DOM | MIT     |
| Motion for React    | MIT     |
| Lucide React        | ISC     |
| idb                 | ISC     |
| music-metadata      | MIT     |

The package lock records the installed dependency tree. Preserve dependency license and copyright notices when redistributing bundled code.

## Product reference

PixelPlayer is a visual and interaction reference only. Its source, screenshots, album artwork, fonts, and branding are not bundled with Wave.

## LRCLIB

Automatic lyrics uses the public [LRCLIB](https://lrclib.net) API. Wave bundles no LRCLIB server code. Downloaded lyrics retain their respective rights; provider attribution is displayed in the player. LRCLIB availability, matching coverage and current API policies are outside Wave's control. Disable metadata lookup in Settings if not wanted.

## Independent native projects

Android: see `platforms/android/THIRD_PARTY_NOTICES.md` and its bundled Apache-2.0 license text. Windows: see `platforms/windows/THIRD_PARTY_NOTICES.md`; production self-contained packages must include the resolved .NET runtime's own license and third-party notices. These are preliminary inventories, not release SBOMs. PixelPlayer is inspiration only; no proprietary code or assets are incorporated. LRCLIB API documentation does not confer a blanket license to song lyrics.
