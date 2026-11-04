import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from './index';
import { STORAGE_KEY, resolveLanguage, systemLanguage, translate } from './dictionary';

function Probe() {
  const { t, language, setChoice } = useI18n();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="text">{t('Add music')}</span>
      <span data-testid="unknown">{t('A sentence nobody translated')}</span>
      <span data-testid="filled">{t('{count} songs', { count: 3 })}</span>
      <button onClick={() => setChoice('en')}>english</button>
      <button onClick={() => setChoice('es')}>spanish</button>
    </div>
  );
}

describe('the language the app speaks', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('takes Spanish from the device and English from anything else', () => {
    expect(systemLanguage(['es-ES', 'en-GB'])).toBe('es');
    expect(systemLanguage(['en-US'])).toBe('en');
    expect(systemLanguage(['fr-FR', 'de'])).toBe('en');
    expect(systemLanguage(['fr-FR', 'es-AR'])).toBe('es');
    expect(systemLanguage([])).toBe('en');
  });

  it('lets a pinned language win over the device', () => {
    expect(resolveLanguage('en', ['es-ES'])).toBe('en');
    expect(resolveLanguage('es', ['en-US'])).toBe('es');
    expect(resolveLanguage('system', ['es-MX'])).toBe('es');
  });

  it('falls back to the English sentence when the dictionary has no entry', () => {
    expect(translate('en', 'Add music')).toBe('Add music');
    expect(translate('es', 'Add music')).toBe('Añadir música');
    expect(translate('es', 'A sentence nobody translated')).toBe('A sentence nobody translated');
    expect(translate('es', '{count} songs', { count: 3 })).toBe('3 songs');
  });

  it('opens in the device language and remembers a choice without announcing it', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('language').textContent).toBe('en');
    act(() => screen.getByText('spanish').click());
    expect(screen.getByTestId('language').textContent).toBe('es');
    expect(screen.getByTestId('text').textContent).toBe('Añadir música');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    act(() => screen.getByText('english').click());
    expect(screen.getByTestId('text').textContent).toBe('Add music');
  });
});
