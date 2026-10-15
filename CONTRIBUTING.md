# Contributing to Wave

Thank you for your interest in improving Wave. Contributions should keep the player simple, private, and pleasant to use.

## Code of conduct

Participation is subject to the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and constructive.

## Reporting bugs

Search the [issue tracker](https://github.com/jaime-gaming/Wave/issues) before opening a new report. Include:

- A clear title and description.
- Steps to reproduce, expected behavior, and actual behavior.
- Browser version, operating system, and Wave version or commit.
- Screenshots or recordings for visual problems.
- The audio format and codec for playback problems, if known.

Do not upload private music, personal information, credentials, or copyrighted test files without permission. A small reproducible audio fixture you are allowed to share is more useful than a large collection.

## Proposing features

Open an issue describing the use case and proposed behavior. Check the [roadmap](docs/ROADMAP.md) and discuss significant architecture changes before implementing them. Network access, permissions, and storage changes need explicit privacy consideration.

## Submitting changes

1. Fork the repository or use the working branch provided by your development environment.
2. Install dependencies with `npm ci`.
3. Make a focused change using the conventions below.
4. Add tests for the behavior being changed.
5. Update the affected documentation in the same change, in English. Distinguish implemented behavior from plans.
6. Run the checks:

   ```bash
   npm run format:check
   npm run lint
   npm test
   npm run build
   npx playwright install chromium
   npm run test:e2e
   ```

7. Use a descriptive commit message, such as `feat: add playlist editing`, `fix: preserve queue position`, or `docs: explain browser storage`.
8. Push your working branch to your fork or the appropriate remote and open a pull request.

Include a summary, related issues, checks run, known limitations, and screenshots for visual changes. Keep commits focused and do not include generated build output.

## Code conventions

- Use TypeScript strict mode. Avoid `any` and unchecked casts.
- Name components and types in `PascalCase`, functions and variables in `camelCase`, and shared constants in `UPPER_SNAKE_CASE`.
- Use English names, comments, interface copy, and documentation.
- Use two-space indentation and run `npm run format` before submitting changes.
- Keep queue transitions in the pure domain reducer, persistence in `data/`, and browser lifecycle management in hooks.
- Use React state rather than manual DOM mutation, except when controlling browser APIs such as audio and dialogs.
- Clean up subscriptions, event handlers, and object URLs.
- Use shared motion tokens and keep exiting content inert; respect Settings and system reduced motion.
- Test database migrations and keep related playlist/track deletions atomic.
- Preserve audio Blob identity during metadata/favorite updates.
- Handle missing metadata, blocked storage, unsupported codecs, and rejected playback promises.
- Do not add remote fonts, tracking, or music services without an agreed product decision.

## Interface conventions

Use shared theme variables rather than hard-coded page-specific colors. Support narrow screens, keyboard operation, visible focus, semantic controls, accessible labels, and reduced motion. Do not fill the production library with sample songs or make unimplemented controls look functional.

## Testing

- Vitest covers queue transitions, metadata fallbacks, filtering, storage migrations, ordered playlist mutations, non-destructive editing, and component behavior.
- Testing Library tests the user-facing interface rather than implementation details.
- Playwright checks browser import, playback, persistence, and narrow-screen layouts using generated audio fixtures.
- Add regression coverage when fixing a bug.
- Test supported browsers manually where codec behavior differs.

See the [development guide](docs/DEVELOPMENT.md) for setup and troubleshooting.

## Licensing

Wave is MIT-licensed. Only contribute code and resources you have the right to distribute under the applicable terms. PixelPlayer is a product reference, not a source-code dependency; do not copy its proprietary implementation or assets. Check and preserve notices for any third-party material you introduce.

## Resources

- [React documentation](https://react.dev/)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [Vite documentation](https://vite.dev/guide/)
- [MDN web platform documentation](https://developer.mozilla.org/)
- [Testing Library](https://testing-library.com/)

Questions and suggestions are welcome in the issue tracker.

## Independent native work and publication

See [PLATFORMS](docs/PLATFORMS.md) for Android/Windows toolchains and the explicit parity gaps. Native source is not a web wrapper. Test platform lifecycle, interruptions, original-byte storage and malformed metadata independently. Do not claim runtime verification from syntax or XML checks. Never check in music, signing credentials, build artifacts or machine-local SDK paths. Public production distribution must satisfy owner-approved publication requirements and applicable dependency/runtime notices.
