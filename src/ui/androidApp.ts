export const ANDROID_APP_URL = '/api/download/android';

export const ANDROID_PROMPT_KEY = 'wave-android-prompt';

export function isAndroidBrowser(
  userAgent: string | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.userAgent,
  standalone = false,
): boolean {
  if (!userAgent || standalone) return false;
  return /Android/u.test(userAgent) && /Mobile|Tablet/u.test(userAgent);
}

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
  } catch {}
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
