/**
 * Registers the offline shell.
 *
 * The service worker only stores the interface, so the app opens and remembers
 * its library when the phone has no connection. It is skipped during development,
 * where a cached bundle would hide every change.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* Offline support is optional; playback keeps working without it. */
    });
  });
}
