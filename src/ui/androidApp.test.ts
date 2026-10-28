import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANDROID_APP_URL,
  ANDROID_PROMPT_KEY,
  isAndroidBrowser,
  promptAlreadyAnswered,
  rememberPromptAnswer,
} from './androidApp';

const androidPhone =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const androidTablet =
  'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Tablet Safari/537.36';
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const desktop =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

beforeEach(() => localStorage.clear());

describe('offering the Android app', () => {
  it('recognises Android phones and tablets only', () => {
    expect(isAndroidBrowser(androidPhone)).toBe(true);
    expect(isAndroidBrowser(androidTablet)).toBe(true);
    expect(isAndroidBrowser(iphone)).toBe(false);
    expect(isAndroidBrowser(desktop)).toBe(false);
    expect(isAndroidBrowser(undefined)).toBe(false);
    // The app itself is not asked to download the app.
    expect(isAndroidBrowser(androidPhone, true)).toBe(false);
  });

  it('asks once, then remembers either answer', () => {
    expect(promptAlreadyAnswered()).toBe(false);
    rememberPromptAnswer('web');
    expect(localStorage.getItem(ANDROID_PROMPT_KEY)).toBe('web');
    expect(promptAlreadyAnswered()).toBe(true);
    rememberPromptAnswer('download');
    expect(promptAlreadyAnswered()).toBe(true);
    // A device with no storage at all is never treated as already answered.
    expect(promptAlreadyAnswered(null)).toBe(false);
  });

  it('points at a real destination for the app file', () => {
    expect(ANDROID_APP_URL).toMatch(/^https:\/\/github\.com\/jaime-gaming\/Wave\//u);
  });
});
