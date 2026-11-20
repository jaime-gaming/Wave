import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLocalizableStrings } from './build-i18n.mjs';

const root = new URL('../', import.meta.url);

function read(relative) {
  return readFileSync(new URL(relative, root), 'utf8');
}

function exists(relative) {
  return existsSync(fileURLToPath(new URL(relative, root)));
}

function allFiles(relative) {
  const directory = fileURLToPath(new URL(relative, root));
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) return allFiles(path);
    return [path];
  });
}

function swiftFiles(relative) {
  return allFiles(relative).filter((path) => path.endsWith('.swift'));
}

function has(relative, pattern) {
  assert.match(read(relative), pattern, `${relative} is missing ${pattern}`);
}

const required = [
  'platforms/ios/Package.swift',
  'platforms/ios/README.md',
  'platforms/ios/Wave.xcodeproj/project.pbxproj',
  'platforms/ios/Wave.xcodeproj/project.xcworkspace/contents.xcworkspacedata',
  'platforms/ios/Wave.xcodeproj/xcshareddata/xcschemes/Wave.xcscheme',
  'platforms/ios/Wave/Info.plist',
  'platforms/ios/Wave/Widgets/Info.plist',
  'platforms/ios/Wave/Assets.xcassets/Contents.json',
  'platforms/ios/Wave/Assets.xcassets/AppIcon.appiconset/Contents.json',
  'platforms/ios/Wave/Assets.xcassets/AppIcon.appiconset/Wave.png',
  'platforms/ios/Wave/es.lproj/Localizable.strings',
  'platforms/ios/Wave/Core/WaveModels.swift',
  'platforms/ios/Wave/Core/WaveLibrary.swift',
  'platforms/ios/Wave/Core/WaveLyrics.swift',
  'platforms/ios/Wave/Core/WaveMix.swift',
  'platforms/ios/Wave/Core/WavePerformance.swift',
  'platforms/ios/Wave/Core/WaveLayout.swift',
  'platforms/ios/Wave/Core/WaveRecap.swift',
  'platforms/ios/Wave/App/WaveApp.swift',
  'platforms/ios/Wave/App/AppDelegate.swift',
  'platforms/ios/Wave/App/MetadataReader.swift',
  'platforms/ios/Wave/App/LibraryPersistence.swift',
  'platforms/ios/Wave/App/AudioPlayer.swift',
  'platforms/ios/Wave/App/NowPlayingCenter.swift',
  'platforms/ios/Wave/App/WaveState.swift',
  'platforms/ios/Wave/App/System/WaveIntents.swift',
  'platforms/ios/Wave/App/System/WaveActivityAttributes.swift',
  'platforms/ios/Wave/App/System/WaveSystemCenter.swift',
  'platforms/ios/Wave/App/System/WaveShareSheet.swift',
  'platforms/ios/Wave/App/Views/RootView.swift',
  'platforms/ios/Wave/App/Views/NowPlayingView.swift',
  'platforms/ios/Wave/App/Views/LiquidGlass.swift',
  'platforms/ios/Wave/App/Views/RemixView.swift',
  'platforms/ios/Wave/App/Views/ImmersiveIdleView.swift',
  'platforms/ios/Wave/Widgets/WaveWidgetBundle.swift',
  'platforms/ios/Wave/Widgets/WaveWidgets.swift',
  'platforms/ios/Wave/Widgets/WaveControlWidget.swift',
  'platforms/ios/Wave/Widgets/WaveLiveActivityView.swift',
  'platforms/ios/WaveCoreTests/WaveCoreTests.swift',
];

test('the iOS app has a complete, local-only, source-only tree', () => {
  for (const path of required) assert.ok(exists(path), `${path} is missing`);
  assert.ok(
    !allFiles('platforms/ios').some((path) => path.endsWith('.entitlements')),
    'no entitlements or capability file may be added',
  );

  const packageManifest = read('platforms/ios/Package.swift');
  assert.match(packageManifest, /\.iOS\(\.v17\)/);
  assert.match(packageManifest, /\.library\(name: "WaveCore"/);
  assert.match(packageManifest, /\.testTarget\(name: "WaveCoreTests"/);
  assert.match(packageManifest, /path: "Wave\/Core"/);

  const appSources = swiftFiles('platforms/ios/Wave/App');
  assert.ok(appSources.length >= 23, `expected the SwiftUI app sources, got ${appSources.length}`);
  const project = read('platforms/ios/Wave.xcodeproj/project.pbxproj');
  for (const path of appSources) {
    assert.match(read(path), /import WaveCore/, `${path} must use the shared core`);
    assert.ok(project.includes(path.split('/').pop()), `The Xcode project does not list ${path}`);
  }
  for (const path of swiftFiles('platforms/ios/Wave')) {
    const source = read(path);
    assert.doesNotMatch(source, /URLSession|URLRequest/, `${path} must stay local`);
    assert.doesNotMatch(source, /https:\/\//, `${path} must not call a service`);
  }
});

test('the Xcode project builds an unsigned app, XCTest target and widget extension', () => {
  const project = read('platforms/ios/Wave.xcodeproj/project.pbxproj');
  const version = JSON.parse(read('package.json')).version;
  assert.match(project, /name = Wave;/);
  assert.match(project, /name = WaveCoreTests;/);
  assert.match(project, /name = WaveWidgetsExtension;/);
  assert.match(project, /productType = "com\.apple\.product-type\.application"/);
  assert.match(project, /productType = "com\.apple\.product-type\.bundle\.unit-test"/);
  assert.match(project, /productType = "com\.apple\.product-type\.app-extension"/);
  assert.match(project, /Embed Foundation Extensions/);
  assert.match(project, /WaveWidgetsExtension\.appex/);
  assert.match(project, /INFOPLIST_FILE = Wave\/Widgets\/Info\.plist;/);
  assert.match(project, /XCLocalSwiftPackageReference/);
  assert.match(project, /productName = WaveCore;/);
  assert.match(project, new RegExp(`MARKETING_VERSION = ${version.replaceAll('.', '\\.')};`));
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = "1,2";/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = io\.github\.jaimegaming\.wave;/);
  assert.match(project, /INFOPLIST_FILE = Wave\/Info\.plist;/);
  assert.match(project, /ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/);
  assert.match(project, /CODE_SIGNING_ALLOWED = NO;/);
  assert.match(project, /CODE_SIGN_STYLE = Manual;/);
  assert.match(project, /DEVELOPMENT_TEAM = "";/);
  assert.doesNotMatch(project, /CODE_SIGN_ENTITLEMENTS/);
  assert.doesNotMatch(project, /PROVISIONING_PROFILE_SPECIFIER/);
  assert.doesNotMatch(project, /DEVELOPMENT_TEAM = "[A-Z0-9]{10}"/);

  const scheme = read('platforms/ios/Wave.xcodeproj/xcshareddata/xcschemes/Wave.xcscheme');
  assert.match(scheme, /BuildableName="Wave\.app"/);
  assert.match(scheme, /BuildableName="WaveCoreTests\.xctest"/);
  assert.match(scheme, /BuildableName="WaveWidgetsExtension\.appex"/);
  assert.match(scheme, /LastUpgradeVersion="2600"/);

  const extensionPlist = read('platforms/ios/Wave/Widgets/Info.plist');
  assert.match(extensionPlist, /NSExtensionPointIdentifier/);
  assert.match(extensionPlist, /com\.apple\.widgetkit-extension/);
});

test('Info.plist declares background audio, Live Activities, Handoff, links and both languages', () => {
  const plist = read('platforms/ios/Wave/Info.plist');
  assert.match(plist, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>/);
  assert.match(plist, /<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
  assert.match(plist, /<key>NSUserActivityTypes<\/key>/);
  assert.match(plist, /<key>CFBundleURLTypes<\/key>/);
  assert.match(plist, /<string>wave<\/string>/);
  assert.match(
    plist,
    /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/,
  );
  assert.match(
    plist,
    /<key>CFBundleLocalizations<\/key>[\s\S]*<string>en<\/string>\s*<string>es<\/string>/,
  );
  assert.match(plist, /<key>UILaunchScreen<\/key>/);
  assert.match(plist, /<key>UIApplicationSceneManifest<\/key>/);
  assert.match(plist, /<key>UIFileSharingEnabled<\/key>\s*<true\/>/);
});

test('the SwiftUI surface covers library, import, queue, Mix, lyrics, artwork and system controls', () => {
  has(
    'platforms/ios/Wave/App/WaveApp.swift',
    /@main[\s\S]*UIApplicationDelegateAdaptor[\s\S]*WindowGroup/,
  );
  has('platforms/ios/Wave/App/AppDelegate.swift', /AVAudioSession/);
  has('platforms/ios/Wave/App/AppDelegate.swift', /beginReceivingRemoteControlEvents/);
  has('platforms/ios/Wave/App/AppDelegate.swift', /wave:\/\//);
  has('platforms/ios/Wave/App/AppDelegate.swift', /NSUserActivity/);
  has('platforms/ios/Wave/App/NowPlayingCenter.swift', /MPNowPlayingInfoCenter/);
  has('platforms/ios/Wave/App/NowPlayingCenter.swift', /MPRemoteCommandCenter/);
  has('platforms/ios/Wave/App/NowPlayingCenter.swift', /MPMediaItemPropertyArtwork/);
  has('platforms/ios/Wave/App/NowPlayingCenter.swift', /changePlaybackPositionCommand/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /AVAudioPlayer/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /prepareToPlay/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /func startMix/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /WaveEnding\.gains/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /clock\?\.invalidate\(\)/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /private func startClock/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /pausedAt/);
  has('platforms/ios/Wave/App/AudioPlayer.swift', /mixStartedAt\.addingTimeInterval/);
  has('platforms/ios/Wave/App/WaveState.swift', /func importFiles/);
  has('platforms/ios/Wave/App/WaveState.swift', /func importLyrics/);
  has('platforms/ios/Wave/App/WaveState.swift', /func enqueue/);
  has('platforms/ios/Wave/App/WaveState.swift', /func removeFromQueue/);
  has('platforms/ios/Wave/App/WaveState.swift', /func startPendingMix/);
  has('platforms/ios/Wave/App/WaveState.swift', /WavePerformance\.profile/);
  has('platforms/ios/Wave/App/WaveState.swift', /WaveRecap\.summarize/);
  has('platforms/ios/Wave/App/WaveState.swift', /system\.connect/);
  has('platforms/ios/Wave/App/WaveState.swift', /func configureCapture/);
  has('platforms/ios/Wave/App/WaveState.swift', /playRemix/);
  has('platforms/ios/Wave/App/WaveState.swift', /shareURL/);
  has('platforms/ios/Wave/App/Views/RootView.swift', /\.fileImporter/);
  has('platforms/ios/Wave/App/Views/RootView.swift', /allowedContentTypes: \[\.audio\]/);
  has('platforms/ios/Wave/App/Views/RootView.swift', /RemixView\(\)/);
  has('platforms/ios/Wave/App/Views/NowPlayingView.swift', /WaveLyrics\.displayLines/);
  has('platforms/ios/Wave/App/Views/NowPlayingView.swift', /\.fileImporter/);
  has('platforms/ios/Wave/App/Views/NowPlayingView.swift', /Import lyrics/);
  has('platforms/ios/Wave/App/Views/NowPlayingView.swift', /ImmersiveIdleView/);
  has('platforms/ios/Wave/App/Views/NowPlayingView.swift', /WaveShareSheet/);
  has('platforms/ios/Wave/App/AppDelegate.swift', /waveCapture/);
  has('platforms/ios/Wave/App/System/WaveSystemCenter.swift', /\.waveCapture/);
  has('platforms/ios/Wave/App/MetadataReader.swift', /AVURLAsset/);
  has('platforms/ios/Wave/App/LibraryPersistence.swift', /atomic/);
  has('platforms/ios/Wave/Core/WaveMix.swift', /instrumentalPulse/);
  has('platforms/ios/Wave/Core/WaveMix.swift', /barPhase/);
  has('platforms/ios/Wave/Core/WaveMix.swift', /enum EndingShape/);
  has('platforms/ios/Wave/Core/WaveMix.swift', /echoCutFraction: Double = 0\.75/);
  has('platforms/ios/WaveCoreTests/WaveCoreTests.swift', /WaveEndingTests/);
  has('platforms/ios/Wave/Core/WaveMix.swift', /downbeat/);
  has('platforms/ios/Wave/Core/WaveMix.swift', /pulseAligned/);
  has('platforms/ios/Wave/Core/WavePerformance.swift', /reducedMotion/);
  has('platforms/ios/Wave/Core/WavePerformance.swift', /lowPowerMode/);
  has('platforms/ios/Wave/Core/WaveLyrics.swift', /sungBounds/);
  has('platforms/ios/Wave/Core/WaveLibrary.swift', /deduplicated/);
  has('platforms/ios/Wave/Core/WaveLayout.swift', /maxContentWidth: safeWidth/);
  has('platforms/ios/Wave/Core/WaveRecap.swift', /func summarize/);
});

test('iOS system integrations stay local and Liquid Glass stays iOS-only', () => {
  has('platforms/ios/Wave/App/System/WaveIntents.swift', /AppShortcutsProvider/);
  has('platforms/ios/Wave/App/System/WaveIntents.swift', /AppIntent/);
  has('platforms/ios/Wave/App/System/WaveActivityAttributes.swift', /ActivityAttributes/);
  has('platforms/ios/Wave/App/System/WaveSystemCenter.swift', /ActivityKit/);
  has('platforms/ios/Wave/App/System/WaveSystemCenter.swift', /WidgetCenter/);
  has(
    'platforms/ios/Wave/App/System/WaveSystemCenter.swift',
    /AVAudioSession\.interruptionNotification/,
  );
  has(
    'platforms/ios/Wave/App/System/WaveSystemCenter.swift',
    /AVAudioSession\.routeChangeNotification/,
  );
  has('platforms/ios/Wave/App/System/WaveSystemCenter.swift', /NSUserActivity/);
  has('platforms/ios/Wave/App/System/WaveShareSheet.swift', /UIActivityViewController/);
  has('platforms/ios/Wave/Widgets/WaveWidgetBundle.swift', /WidgetBundle/);
  has('platforms/ios/Wave/Widgets/WaveWidgetBundle.swift', /if #available\(iOS 18\.0, \*\)/);
  has('platforms/ios/Wave/Widgets/WaveWidgets.swift', /WidgetKit/);
  has('platforms/ios/Wave/Widgets/WaveWidgets.swift', /Button\(intent:/);
  has('platforms/ios/Wave/Widgets/WaveControlWidget.swift', /ControlWidget/);
  has(
    'platforms/ios/Wave/Widgets/WaveLiveActivityView.swift',
    /supplementalActivityFamilies\(\[\.small\]\)/,
  );
  has('platforms/ios/Wave/Widgets/WaveLiveActivityView.swift', /DynamicIsland/);
  has('platforms/ios/Wave/App/Views/LiquidGlass.swift', /#available\(iOS 26, \*\)/);
  has('platforms/ios/Wave/App/Views/LiquidGlass.swift', /GlassEffectContainer/);
  has('platforms/ios/Wave/App/Views/LiquidGlass.swift', /\.glassEffect\(\.regular/);
  has('platforms/ios/Wave/App/Views/LiquidGlass.swift', /buttonStyle\(\.glass\)/);
  has('platforms/ios/Wave/App/Views/LiquidGlass.swift', /\.ultraThinMaterial/);
  has(
    'platforms/ios/Wave/App/Views/LiquidGlass.swift',
    /UIAccessibility\.isReduceTransparencyEnabled/,
  );

  for (const path of [
    'src/styles.css',
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/Screens.kt',
    'platforms/windows/Wave.Windows/MainWindow.xaml',
  ]) {
    assert.doesNotMatch(
      read(path),
      /glassEffect|GlassEffectContainer|Liquid Glass/,
      `${path} must not use iOS Liquid Glass`,
    );
  }
});

test('XCTest, generated Spanish, docs and macOS 26 CI travel with the app', () => {
  const tests = read('platforms/ios/WaveCoreTests/WaveCoreTests.swift');
  assert.match(tests, /import XCTest/);
  assert.match(tests, /final class WaveMixTests: XCTestCase/);
  assert.match(tests, /testInstrumentalEdgesMeetOnBothDownbeats/);
  assert.match(tests, /final class WavePerformanceTests: XCTestCase/);
  assert.match(tests, /final class WaveLayoutTests: XCTestCase/);
  assert.match(tests, /final class WaveRecapTests: XCTestCase/);
  assert.match(tests, /WaveLyricsTests/);
  assert.match(tests, /WaveLibraryTests/);

  const dictionary = JSON.parse(read('i18n/es.json'));
  const entries = Object.entries(dictionary);
  assert.equal(
    read('platforms/ios/Wave/es.lproj/Localizable.strings'),
    renderLocalizableStrings(entries),
    'Run npm run build:i18n and commit the iOS strings',
  );
  for (const path of swiftFiles('platforms/ios/Wave')) {
    const source = read(path);
    for (const [, key] of source.matchAll(/WaveTheme\.loc\("([^"]+)"\)/g)) {
      assert.ok(key in dictionary, `${path} uses the untranslated phrase "${key}"`);
    }
    for (const [, key] of source.matchAll(/waveLoc\("([^"]+)"\)/g)) {
      assert.ok(key in dictionary, `${path} uses the untranslated widget phrase "${key}"`);
    }
    for (const [, key] of source.matchAll(/LocalizedStringResource = "([^"]+)"/g)) {
      assert.ok(key in dictionary, `${path} uses the untranslated intent phrase "${key}"`);
    }
  }

  const generator = read('scripts/build-i18n.mjs');
  assert.match(generator, /STRINGS_TARGET/);
  assert.match(generator, /renderLocalizableStrings/);
  assert.match(read('package.json'), /scripts\/ios-release\.test\.mjs/);
  assert.match(read('package.json'), /scripts\/responsive-layout\.test\.mjs/);

  const workflow = read('.github/workflows/ci.yml');
  const nativeWorkflow = read('.github/workflows/native.yml');
  assert.match(workflow, /^ {2}ios:\s*$/m);
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /Xcode_26/);
  assert.match(workflow, /xcode-select/);
  assert.doesNotMatch(workflow, /macos-15/);
  assert.match(workflow, /swift test --package-path platforms\/ios/);
  assert.match(workflow, /xcodebuild -project platforms\/ios\/Wave\.xcodeproj -scheme Wave/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO build/);
  assert.match(workflow, /node --test scripts\/ios-release\.test\.mjs/);
  assert.match(nativeWorkflow, /^ {2}ios-captures:\s*$/m);
  assert.match(nativeWorkflow, /runs-on: macos-26/);
  assert.match(nativeWorkflow, /wave:\/\/capture\?page=/);
  assert.match(nativeWorkflow, /xcrun simctl io/);
  assert.match(nativeWorkflow, /ios- platforms\/ios/);
  for (const path of ['.github/workflows/release.yml', '.github/workflows/native.yml']) {
    assert.doesNotMatch(
      read(path),
      /\.ipa|App Store|altool|notarytool/,
      `${path} must not publish iOS`,
    );
  }

  const readme = read('README.md');
  const platforms = read('docs/PLATFORMS.md');
  const iosReadme = read('platforms/ios/README.md');
  assert.match(readme, /SwiftUI app for iPhone and iPad/);
  assert.match(readme, /docs\/media\/ios-home\.png/);
  assert.match(readme, /no\s+App Store upload/);
  assert.match(readme, /Liquid Glass/);
  assert.match(readme, /Xcode 26/);
  assert.match(platforms, /## iOS[\s\S]*MPNowPlayingInfoCenter[\s\S]*MPRemoteCommandCenter/);
  assert.match(platforms, /source-only for now/);
  assert.match(platforms, /WidgetKit/);
  assert.match(platforms, /ActivityKit/);
  assert.match(platforms, /App Intents|AppIntents/);
  assert.match(platforms, /ControlWidget/);
  assert.match(platforms, /CarPlay/);
  assert.match(platforms, /Handoff/);
  assert.match(platforms, /Share\s+sheet/);
  assert.match(platforms, /Liquid Glass is iOS-only/);
  assert.match(platforms, /macos-26/);
  assert.match(platforms, /Xcode 26/);
  assert.doesNotMatch(platforms, /macos-15/);
  assert.match(iosReadme, /no\s+App Store upload/);
  assert.match(iosReadme, /swift test --package-path platforms\/ios/);
  assert.match(iosReadme, /Xcode 26/);
  assert.match(iosReadme, /macos-26/);
  assert.match(iosReadme, /wave:\/\/capture\?page=home/);
  assert.match(platforms, /real iOS screenshots/);
  assert.match(iosReadme, /Liquid Glass, iOS only/);
  assert.doesNotMatch(iosReadme, /macos-15/);
  assert.doesNotMatch(iosReadme, /Xcode 16/);
});
