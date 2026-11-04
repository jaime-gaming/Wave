/* eslint-disable react-refresh/only-export-components */
// The provider and the two hooks that read it belong together; splitting them
// would only add a file per identifier.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  readChoice,
  resolveLanguage,
  translate,
  STORAGE_KEY,
  type Language,
  type LanguageChoice,
} from './dictionary';

/**
 * The dictionary every Wave client reads from, and the two hooks that reach it.
 *
 * There is no announcement and no first-run question: the app opens in the
 * language the device is already in, and the choice is written down only in
 * Settings → Appearance.
 */
type I18nValue = {
  language: Language;
  choice: LanguageChoice;
  setChoice: (choice: LanguageChoice) => void;
  t: (english: string, values?: Record<string, string | number>) => string;
};

// Outside the provider the app still speaks English — and placeholders still
// get filled, so a component rendered on its own reads like the real thing.
const fallback = (english: string, values?: Record<string, string | number>) =>
  translate('en', english, values);
const I18nContext = createContext<I18nValue>({
  language: 'en',
  choice: 'system',
  setChoice: () => {},
  t: fallback,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<LanguageChoice>(readChoice);
  const [language, setLanguage] = useState<Language>(() => resolveLanguage(readChoice()));
  useEffect(() => {
    // The device language can change while the tab is open — a phone switching
    // its system language, a browser preference edited in another window.
    const apply = () => setLanguage(resolveLanguage(choice));
    apply();
    window.addEventListener('languagechange', apply);
    return () => window.removeEventListener('languagechange', apply);
  }, [choice]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* A tab with storage blocked still follows the device. */
    }
    document.documentElement.lang = language;
  }, [choice, language]);
  const change = useCallback((next: LanguageChoice) => setChoice(next), []);
  const t = useCallback(
    (english: string, values?: Record<string, string | number>) =>
      translate(language, english, values),
    [language],
  );
  const value = useMemo(
    () => ({ language, choice, setChoice: change, t }),
    [language, choice, change, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The current language and a function that translates one English sentence. */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Short form for components that only need to translate. */
export function useT() {
  return useContext(I18nContext).t;
}
