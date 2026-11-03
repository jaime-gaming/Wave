import spanish from '../../i18n/es.json';

/**
 * The languages Wave speaks, and how it decides which one.
 *
 * There is no announcement and no first-run question. The app opens in the
 * language the device is already in — Spanish if the system asks for Spanish,
 * English for everything else — and the only place that choice is written down
 * is a row in Settings → Appearance, where it can be pinned to English or
 * Spanish instead of following the system.
 *
 * The dictionary's keys are the English sentences themselves, so a screen that
 * has not been translated yet still reads correctly in English instead of
 * showing a key or a blank.
 */
export type Language = 'en' | 'es';
/** What the person chose: follow the device, or pin one language. */
export type LanguageChoice = 'system' | Language;

export const STORAGE_KEY = 'wave-language';
const dictionary: Record<string, string> = spanish;

export const languages: { id: LanguageChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

/** The first language the device asks for wins; Spanish if it is in the list. */
export function systemLanguage(tags?: readonly string[]): Language {
  const list =
    tags ??
    (typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language]);
  return list.some((tag) => String(tag).toLowerCase().startsWith('es')) ? 'es' : 'en';
}

export function resolveLanguage(choice: LanguageChoice, tags?: readonly string[]): Language {
  return choice === 'system' ? systemLanguage(tags) : choice;
}

export function readChoice(): LanguageChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'es' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** English text through the dictionary, with `{name}` placeholders filled in. */
export function translate(
  language: Language,
  english: string,
  values?: Record<string, string | number>,
): string {
  const text = (language === 'es' ? dictionary[english] : undefined) ?? english;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * The current sentence, without a hook.
 *
 * The error screen is a class component that also sits above the provider, and a
 * thrown render must not throw again because a context was missing. It reads the
 * choice and the device directly, which is enough for a page that is shown once.
 */
export function translateNow(english: string): string {
  return translate(resolveLanguage(readChoice()), english);
}
