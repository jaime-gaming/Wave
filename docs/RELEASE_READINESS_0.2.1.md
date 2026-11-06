# Wave 0.2.1 — release readiness

Status: **candidate, not published**. Prepared 6 November 2026.

## Candidate scope

Web listening/Remix/search polish, bounded Mix/AutoPlay improvements, native control refinements and native-only release assets. Version `0.2.1`, Windows assembly/file `0.2.1.0`, Android version code `5`. Version/date consistency is checked by `npm run release:check`. Confirm the final publication date before tagging.

## Repeatable technical gates

```sh
npm ci
npm run build:i18n
npm run format:check
npm run lint
npm test
npm run test:release
python3 -m unittest discover -s scripts -p test_package_release.py
npm run release:check -- v0.2.1
npm run build
npx playwright install --with-deps chromium
npm run test:smoke
npm run deploy:check
```

The smoke suite is a **blocking step** in both Checks and Release assets. It covers small screens, route direction, touch/mouse feedback, action-state/motion preferences, compact Remix details, search composition/category behavior, AutoPlay on/off, trim ownership, real local volume analysis and repeat overlap. The broader historical browser suite remains diagnostic and must not be described as wholly passing. Detailed run results live in [VALIDATION](VALIDATION.md).

Native builds use JDK 17/SDK 36/Gradle 8.13 and Windows/.NET 10. Both have unit/contract/UI checks. Their source controls were previously compiling and testing successfully; the failing CI steps were screenshot publication from detached HEADs. Publication now pushes an explicit source ref, skips stale-source captures, aborts rebase conflicts safely and retries concurrent advances without force-pushing. Native CI for code revision `6e57af4` passed both Android and Windows, including the corrected capture publication and packaging. Subsequent candidate changes here are documentation, captures and app-surface checks; still require successful CI on the final approved revision before launch.

## Human and device sign-off — not replaced by automated tests

- [ ] Listen with headphones to quiet/loud recordings, Mix joins and repeat boundaries; confirm no sudden gain burst.
- [ ] Android: import/playback, focus loss/recovery, headphone unplug, lock-screen notification, widget/tile and narrow/landscape controls.
- [ ] Windows: portable EXE launch on a clean machine, file permissions, keyboard navigation, audio output, sound synchronization and Defender review.
- [ ] Verify actual external lyric/word-timing and video provider availability. Mocked provider/layout tests do not establish uptime or live footage playback.
- [ ] Review native/web screenshots and final notes. No fabricated native/device verification.
- [ ] Confirm test/unsigned distribution is intentional; signing credentials/store approval are separate. Never relabel a debug APK or unsigned ZIP as production-signed.
- [ ] Confirm backup/restore and retain original library files during upgrade.

## Operator publication sequence

1. Review the session branch and its CI; merge the approved candidate into `main` through the normal review process. The release workflow requires the tagged commit to be an ancestor of `origin/main`.
2. Confirm version/date and rerun the gates above against that exact source.
3. **Only when launch is explicitly approved:** create the matching `v0.2.1` tag and an existing draft GitHub Release using `RELEASE_NOTES_0.2.1.md`. Manually dispatch Release assets with that tag to populate the draft; uploads require an existing release. Builds use the exact tag, not a moving branch.
4. Wait for Android/Windows packaging and security-scan results. Verify native-only attachments and SHA256 checksums; review unsigned/test labels and bundled licenses. Publish the approved draft only after that review. Publication also triggers the tagged workflow; never move the tag to retry.
5. Deploy the website separately using Cloudflare Workers, never GitHub Pages. `deploy:check` is a dry run, not a deployment.
6. Verify installed/native launch and website update paths; keep the prior release and original files available if rollback is needed.

No release, tag, merge or production deployment is performed merely by preparing this candidate.
