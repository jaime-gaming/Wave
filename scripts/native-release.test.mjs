import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const native = readFileSync(new URL('../.github/workflows/native.yml', import.meta.url), 'utf8');
const nativeRead = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('releases validate built source and required smoke checks but publish no web bundle', () => {
  assert.match(release, /npm run release:check/);
  assert.match(release, /npm run test:smoke/);
  assert.match(release, /npm test && npm run build/);
  assert.match(release, /needs: validate/);
  assert.match(release, /uses: \.\/\.github\/workflows\/native.yml/);
  assert.match(release, /secrets: inherit/);
  assert.doesNotMatch(release, /package_release.py --output|gh release upload|wave-web-release/);
});
test('native release builds attach the unsigned Windows executable and signed Android package', () => {
  assert.match(native, /workflow_call:/);
  assert.equal((native.match(/ref: \$\{\{ inputs.tag \|\| github.sha \}\}/g) ?? []).length, 3);
  assert.match(native, /apksigner" verify/);
  assert.match(native, /persistent Android release keystore is required/);
  const windows = native.split('  windows:\n')[1].split('  ios-captures:\n')[0];
  assert.doesNotMatch(
    windows,
    /Sign-Release\.ps1|Set-AuthenticodeSignature|New-SelfSignedCertificate|Import-PfxCertificate|WINDOWS_SIGNING_CERT|WINDOWS_TIMESTAMP_URL/,
  );
  assert.match(windows, /dotnet publish [^\n]+-p:PublishSingleFile=true/);
  assert.match(
    windows,
    /Copy-Item artifacts\/windows-raw\/Wave\.exe artifacts\/windows\/Wave\.exe/,
  );
  assert.match(windows, /unsigned single-file executable/);
  assert.match(windows, /Get-FileHash/);
  assert.match(windows, /Scan Wave\.exe when Defender is available/);
  assert.match(windows, /path: artifacts\/windows\/Wave\.exe/);
  assert.match(windows, /if: inputs.tag != ''/);
  assert.match(native, /gh release upload "\$RELEASE_TAG" artifacts\/android\/Wave\.apk --clobber/);
  assert.match(
    native,
    /gh release upload "\$env:RELEASE_TAG" artifacts\/windows\/Wave\.exe --clobber/,
  );
  assert.doesNotMatch(
    native,
    /Compress-Archive|Wave-Windows-x64-unsigned\.zip|Wave-Android-test-only\.apk/,
  );
  assert.equal((native.match(/if: inputs.tag != ''/g) ?? []).length, 2);
});

test('native screenshot publishing handles detached checkouts and does not publish failed or stale captures', () => {
  const script = readFileSync(new URL('./publish-native-screenshots.sh', import.meta.url), 'utf8');
  assert.equal((native.match(/run: bash scripts\/publish-native-screenshots.sh/g) ?? []).length, 3);
  assert.equal((native.match(/if: github.event_name == 'push' && success\(\)/g) ?? []).length, 3);
  assert.match(script, /git push --quiet origin "HEAD:refs\/heads\/\$GITHUB_REF_NAME"/);
  assert.match(script, /git diff --quiet "\$GITHUB_SHA" FETCH_HEAD/);
  assert.match(script, /git rebase --abort/);
  assert.doesNotMatch(script, /--force|\|\| true/);
});

test('Android and Windows carry the v3.0 native contract parity', () => {
  const androidPulse = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/NativePulse.kt',
  );
  assert.match(androidPulse, /enum class DeviceProfile/);
  assert.match(androidPulse, /object NativePulse/);
  assert.match(androidPulse, /fun plan\(/);
  assert.match(androidPulse, /fun remixMetrics/);
  const androidLibrary = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/Library.kt',
  );
  assert.match(androidLibrary, /val bpm: Double\? = null/);
  assert.match(androidLibrary, /val barOffset: Double\? = null/);
  const androidPlayer = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/Player.kt',
  );
  assert.match(androidPlayer, /fadeLength = remaining/);
  assert.match(androidPlayer, /fadeCue/);
  const androidIdle = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/IdleStage.kt',
  );
  assert.match(androidIdle, /ImmersiveIdleStage/);
  const androidNowPlaying = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/NowPlaying.kt',
  );
  assert.match(androidNowPlaying, /30_000L/);
  assert.match(androidNowPlaying, /ImmersiveIdleStage/);
  const androidScreens = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/Screens.kt',
  );
  assert.match(androidScreens, /remixMetrics/);
  assert.match(androidScreens, /LocalWaveProfile/);
  assert.match(androidScreens, /maxItemsInEachRow/);
  const androidChrome = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/WaveChrome.kt',
  );
  assert.match(androidChrome, /rememberDeviceProfile/);
  assert.match(androidChrome, /LocalWaveProfile/);
  const androidTests = nativeRead(
    'platforms/android/app/src/test/java/io/github/jaimegaming/wave/NativePulseTest.kt',
  );
  assert.match(androidTests, /NativePulse\.plan/);
  assert.match(androidTests, /remixMetrics/);

  const windowsCollections = nativeRead('platforms/windows/Wave.Windows/Collections.cs');
  assert.match(windowsCollections, /class NativePulse/);
  assert.match(windowsCollections, /record NativeRemixMetrics/);
  assert.match(windowsCollections, /record NativeMixPulsePlan/);
  const windowsLibrary = nativeRead('platforms/windows/Wave.Windows/Library.cs');
  assert.match(windowsLibrary, /double\? Bpm/);
  assert.match(windowsLibrary, /double\? BarOffset/);
  const windowsMain = nativeRead('platforms/windows/Wave.Windows/MainWindow.xaml.cs');
  assert.match(windowsMain, /UpdateProfile/);
  assert.match(windowsMain, /UpdateIdleStage/);
  assert.match(windowsMain, /RemixLayout/);
  assert.match(windowsMain, /fadeLength = remaining/);
  const windowsXaml = nativeRead('platforms/windows/Wave.Windows/MainWindow.xaml');
  assert.match(windowsXaml, /IdleStage/);
  assert.match(windowsXaml, /PreviewMouseMove/);
  assert.match(windowsXaml, /PreviewMouseDown/);
  const windowsBrowse = nativeRead('platforms/windows/Wave.Windows/MainWindow.Browse.cs');
  assert.match(windowsBrowse, /RemixLayout/);
  const windowsTests = nativeRead('platforms/windows/Wave.Contracts.Tests/Program.cs');
  assert.match(windowsTests, /NativePulse/);
  assert.match(windowsTests, /NativeLayout/);
  assert.match(windowsTests, /PulseLyrics/);
});

test('Mix endings are detected on web, Android, Windows and iOS and the iOS app is photographed natively', () => {
  assert.match(nativeRead('src/domain/mixEnding.ts'), /return stagedGains\(progress\)/);
  assert.match(
    nativeRead('src/audio/MixAudio.ts'),
    /endingGains\(progress, this\.fading\.ending\)/,
  );
  assert.match(nativeRead('src/hooks/usePlayer.ts'), /mixDecision/);
  assert.match(
    nativeRead('platforms/android/app/src/main/java/io/github/jaimegaming/wave/Contracts.kt'),
    /enum class EndingShape/,
  );
  assert.match(
    nativeRead('platforms/android/app/src/main/java/io/github/jaimegaming/wave/Player.kt'),
    /endingGains\(progress, fadeEnding\)/,
  );
  assert.match(nativeRead('platforms/windows/Wave.Windows/Collections.cs'), /class NativeEnding/);
  assert.match(
    nativeRead('platforms/windows/Wave.Windows/MainWindow.xaml.cs'),
    /NativeEnding\.Gains\(fraction, fadeEnding\)/,
  );
  assert.match(
    nativeRead('platforms/ios/Wave/Core/WaveMix.swift'),
    /func cut\(_ shape: EndingShape\) -> Double \{ 1 \}/,
  );
  assert.match(nativeRead('platforms/ios/Wave/App/AudioPlayer.swift'), /WaveEnding\.gains/);
  assert.match(native, /^ {2}ios-captures:\s*$/m);
  assert.match(native, /runs-on: macos-26/);
  assert.match(native, /SIMCTL_CHILD_WAVE_CAPTURE_PAGE/);
  assert.match(native, /xcrun simctl io "\$DEVICE" screenshot/);
  assert.match(native, /publish-native-screenshots\.sh artifacts\/ios-ui ios- platforms\/ios/);
  assert.match(nativeRead('docs/DEVELOPMENT.md'), /iOS screenshots/);
});

test('listening cards share only generated artwork and a Wave link', () => {
  const android = nativeRead(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/ListeningShare.kt',
  );
  const paths = nativeRead('platforms/android/app/src/main/res/xml/listening_share_paths.xml');
  const manifest = nativeRead('platforms/android/app/src/main/AndroidManifest.xml');
  const ios = nativeRead('platforms/ios/Wave/App/System/WaveShareSheet.swift');
  assert.match(android, /Intent\.ACTION_SEND/);
  assert.match(android, /FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(android, /FileProvider\.getUriForFile/);
  assert.doesNotMatch(android, /song\.path|song\.lyrics|audio\//);
  assert.match(paths, /cache-path name="listening_cards" path="listening-cards\/"/);
  assert.doesNotMatch(paths, /files-path|external-path/);
  assert.match(manifest, /android:authorities="\$\{applicationId\}\.listening-cards"/);
  assert.match(
    ios,
    /activityItems: \[image, URL\(string: "https:\/\/wave\.jaime-gaming\.com"\)!\]/,
  );
  assert.doesNotMatch(ios, /fileName|persistence/);
});
