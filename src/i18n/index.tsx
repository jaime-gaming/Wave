/* eslint-disable react-refresh/only-export-components */

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

type I18nValue = {
  language: Language;
  choice: LanguageChoice;
  setChoice: (choice: LanguageChoice) => void;
  t: (english: string, values?: Record<string, string | number>) => string;
};

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
    const apply = () => setLanguage(resolveLanguage(choice));
    apply();
    window.addEventListener('languagechange', apply);
    return () => window.removeEventListener('languagechange', apply);
  }, [choice]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {}
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

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
