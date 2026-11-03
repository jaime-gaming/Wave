import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { AppError } from './components/AppError';
import '@fontsource-variable/nunito-sans';
import './styles.css';
import './styles/player.css';
import './styles/listening.css';
import { registerServiceWorker } from './ui/offline';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppError>
        <App />
      </AppError>
    </I18nProvider>
  </StrictMode>,
);
