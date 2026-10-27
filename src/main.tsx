import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/nunito-sans';
import './styles.css';
import './styles/player.css';
import './styles/listening.css';
import { registerServiceWorker } from './ui/offline';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
