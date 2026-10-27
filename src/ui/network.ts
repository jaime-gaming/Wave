import { useSyncExternalStore } from 'react';

/**
 * Connectivity, without guessing.
 *
 * `navigator.onLine` is coarse: it can say "online" on a captive network. It is
 * still the right signal for one thing — greying a control that needs the
 * network instead of letting it fail in front of the user. Anything already
 * cached keeps working, so this never hides content.
 */
export const OFFLINE_TEXT = 'Offline';

const subscribe = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

const snapshot = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/**
 * Label for a control that needs the network.
 *
 * A control with visible text says `Offline` instead of its own label, so the
 * reason is on screen. A control that is only an icon keeps its accessible name
 * and gets the explanation through `aria-describedby` instead of growing text it
 * was not designed for.
 */
export function networkLabel(online: boolean, label: string): string {
  return online ? label : OFFLINE_TEXT;
}

/**
 * Accessible name for the same control. The visible text becomes `Offline`, so
 * without this a screen reader would hear "Offline" and lose the action itself.
 */
export function networkAriaLabel(online: boolean, label: string): string | undefined {
  return online ? undefined : `${label}: ${OFFLINE_TEXT.toLowerCase()}`;
}
