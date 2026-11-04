/**
 * The Android build, and how the web client offers it.
 *
 * Wave exists as a native Android app, and a phone that lands on the web client
 * should be told so once — not nagged. These helpers hold the decisions so the
 * sheet stays a presentation component and the rules can be tested without a
 * browser.
 */

/** Where the Android app is published. Point this at the release asset. */
export const ANDROID_APP_URL = 'https://github.com/jaime-gaming/Wave/releases/latest';

/** Set once the phone has answered the question, one way or the other. */
export const ANDROID_PROMPT_KEY = 'wave-android-prompt';

/**
 * Whether this is an Android phone browsing the web.
 *
 * A tablet is included: the native app is the better experience there too. A
 * device that already runs the app installed to its home screen is not asked —
 * it is already using it.
 */
export function isAndroidBrowser(
  userAgent: string | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.userAgent,
  standalone = false,
): boolean {
  if (!userAgent || standalone) return false;
  return /Android/u.test(userAgent) && /Mobile|Tablet/u.test(userAgent);
}

/** True when the browser reports the page was opened from an installed app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
}

export function promptAlreadyAnswered(store: Storage | null = storage()): boolean {
  if (!store) return false;
  try {
    return store.getItem(ANDROID_PROMPT_KEY) !== null;
  } catch {
    return false;
  }
}

export function rememberPromptAnswer(
  answer: 'download' | 'web' | 'dismissed',
  store: Storage | null = storage(),
): void {
  if (!store) return;
  try {
    store.setItem(ANDROID_PROMPT_KEY, answer);
  } catch {
    /* Remembering is a courtesy; playback does not depend on it. */
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
