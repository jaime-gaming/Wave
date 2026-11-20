/// <reference types="vite/client" />

/** Injected by `vite.config.ts` from `package.json`. */
declare const __WAVE_VERSION__: string;

/** Set by `main.tsx` as soon as React mounts; read by the boot watchdog in `public/boot.js`. */
interface Window {
  __waveBooted?: boolean;
}
