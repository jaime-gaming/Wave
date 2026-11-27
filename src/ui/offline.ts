const RELOAD_KEY = 'wave-shell-reloaded';

export interface RegisterOptions {
  prod?: boolean;
  base?: string;
  container?: ServiceWorkerContainer;
  doc?: Document;
  reload?: () => void;
}

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
  } catch {}
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
        void registration.update().catch(() => undefined);
        doc.addEventListener('visibilitychange', () => {
          if (!doc.hidden) void registration.update().catch(() => undefined);
        });
      })
      .catch(() => {});
  };

  if (doc.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  container.addEventListener?.('controllerchange', () => {
    if (!shouldReloadOnControllerChange(hadController, reloadAttempted())) return;
    markReload();
    reload();
  });
}
