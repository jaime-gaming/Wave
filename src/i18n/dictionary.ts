import spanish from '../../i18n/es.json';

export type Language = 'en' | 'es';

export type LanguageChoice = 'system' | Language;

export const STORAGE_KEY = 'wave-language';
const dictionary: Record<string, string> = spanish;

export const languages: { id: LanguageChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

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

export function translateNow(english: string): string {
  return translate(resolveLanguage(readChoice()), english);
}
