/**
 * Registers the offline shell.
 *
 * The service worker only stores the interface, so the app opens and remembers
 * its library when the phone has no connection. It is skipped during development,
 * where a cached bundle would hide every change.
 *
 * Wave 3.0: the shell is versioned by build (see public/sw.js). Registration
 * therefore opts out of the HTTP cache for the worker script, checks for a new
 * build on every start and when the tab comes back, and reloads once when a new
 * worker takes control of a tab that already had one. That last part is what
 * stops an old document from being paired with a new build's hashed assets —
 * the blank page that used to need Ctrl+Shift+R.
 */
const RELOAD_KEY = 'wave-shell-reloaded';

export interface RegisterOptions {
  /** Overrides `import.meta.env.PROD`, so the registration can be tested. */
  prod?: boolean;
  base?: string;
  container?: ServiceWorkerContainer;
  doc?: Document;
  reload?: () => void;
}

/** A fresh install is not a reason to reload; a replacement worker is. */
export function shouldReloadOnControllerChange(
  hadController: boolean,
  reloadAttempted: boolean,
): boolean {
  return hadController && !reloadAttempted;
}

function reloadAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_KEY) === '1';
  } catch {
    return false;
  }
}

function markReload(): void {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    /* Private modes may refuse storage; the worker itself still updates. */
  }
}

export function registerServiceWorker(options: RegisterOptions = {}): void {
  const prod = options.prod ?? import.meta.env.PROD;
  if (!prod) return;
  const container =
    options.container ??
    (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : undefined);
  if (!container) return;
  const doc = options.doc ?? document;
  const base = options.base ?? import.meta.env.BASE_URL;
  const reload = options.reload ?? (() => window.location.reload());
  const hadController = !!container.controller;

  const start = () => {
    void container
      .register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
      .then((registration) => {
        // Never let the browser's HTTP cache hide a newly deployed worker.
        void registration.update().catch(() => undefined);
        doc.addEventListener('visibilitychange', () => {
          if (!doc.hidden) void registration.update().catch(() => undefined);
        });
      })
      .catch(() => {
        /* Offline support is optional; playback keeps working without it. */
      });
  };

  if (doc.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  container.addEventListener?.('controllerchange', () => {
    if (!shouldReloadOnControllerChange(hadController, reloadAttempted())) return;
    markReload();
    reload();
  });
}
