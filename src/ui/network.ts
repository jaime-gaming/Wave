import { useSyncExternalStore } from 'react';

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

export function networkLabel(online: boolean, label: string): string {
  return online ? label : OFFLINE_TEXT;
}

export function networkAriaLabel(online: boolean, label: string): string | undefined {
  return online ? undefined : `${label}: ${OFFLINE_TEXT.toLowerCase()}`;
}
