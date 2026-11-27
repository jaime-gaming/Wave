import { clearWaveData, RESET_MARKER } from '../data/reset';

export function startReset(root: HTMLElement) {
  let language = navigator.language;
  try {
    const saved = localStorage.getItem('wave-language');
    if (saved && saved !== 'system') language = saved;
  } catch {}
  const spanish = language.toLowerCase().startsWith('es');
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'reset-screen';
  try {
    if (localStorage.getItem('wave-animations-enabled') === 'false')
      main.classList.add('no-motion');
  } catch {}
  const mark = document.createElement('span');
  mark.className = 'reset-indicator';
  mark.setAttribute('aria-hidden', 'true');
  const title = document.createElement('h1');
  title.textContent = spanish ? 'Restableciendo Wave' : 'Resetting Wave';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = spanish ? 'Un momento, por favor…' : 'One moment, please…';
  main.append(mark, title, status);
  root.append(main);
  void clearWaveData()
    .then(() => {
      sessionStorage.removeItem(RESET_MARKER);
      window.location.replace(import.meta.env.BASE_URL);
    })
    .catch(() => {
      mark.hidden = true;
      status.setAttribute('role', 'alert');
      status.textContent = spanish
        ? 'No se pudo completar el borrado. Puede que algunos datos ya se hayan eliminado. Cierra otras pestañas de Wave y vuelve a intentarlo.'
        : 'Reset could not finish. Some data may already be gone. Close other Wave tabs and try again.';
      const retry = document.createElement('button');
      retry.className = 'filled-button';
      retry.textContent = spanish ? 'Reintentar' : 'Try again';
      retry.onclick = () => window.location.reload();
      const leave = document.createElement('button');
      leave.className = 'text-button';
      leave.textContent = spanish ? 'Volver a Wave' : 'Return to Wave';
      leave.onclick = () => {
        sessionStorage.removeItem(RESET_MARKER);
        window.location.replace(import.meta.env.BASE_URL);
      };
      main.append(retry, leave);
    });
}
