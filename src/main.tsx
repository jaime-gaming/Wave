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
import { RESET_MARKER } from './data/reset';
import { startReset } from './components/ResetScreen';
import { applyPerformanceProfile, currentProfile, watchPerformanceProfile } from './ui/performance';

registerServiceWorker();

applyPerformanceProfile(currentProfile());
watchPerformanceProfile((profile) => applyPerformanceProfile(profile));

window.__waveBooted = true;

const rootElement = document.getElementById('root')!;
let resetRequested = false;
try {
  resetRequested = sessionStorage.getItem(RESET_MARKER) === 'true';
} catch {}
if (resetRequested) startReset(rootElement);
else
  createRoot(rootElement).render(
    <StrictMode>
      <I18nProvider>
        <AppError>
          <App />
        </AppError>
      </I18nProvider>
    </StrictMode>,
  );
