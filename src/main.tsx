import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { AppError } from './components/AppError';
import '@fontsource-variable/nunito-sans';
import './styles.css';
import './styles/player.css';
import './styles/listening.css';
import './styles/idle.css';
import { registerServiceWorker } from './ui/offline';
import { applyPerformanceProfile, currentProfile, watchPerformanceProfile } from './ui/performance';

registerServiceWorker();

// One automatic profile per device, applied before the first paint so a modest
// phone never flashes the full-weight interface. No setting to find.
applyPerformanceProfile(currentProfile());
watchPerformanceProfile((profile) => applyPerformanceProfile(profile));

// The boot watchdog in public/boot.js reads this (and the mounted root) to know
// the app started and no shell recovery is needed.
window.__waveBooted = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppError>
        <App />
      </AppError>
    </I18nProvider>
  </StrictMode>,
);
