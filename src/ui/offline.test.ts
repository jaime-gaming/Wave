import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, shouldReloadOnControllerChange } from './offline';

function fakeContainer(hadController: boolean) {
  const listeners = new Map<string, (() => void)[]>();
  const registration = { update: vi.fn(() => Promise.resolve(undefined)) };
  const value = {
    controller: hadController ? {} : null,
    register: vi.fn(() => Promise.resolve(registration)),
    addEventListener: vi.fn((type: string, callback: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), callback]);
    }),
    fire(type: string) {
      for (const callback of listeners.get(type) ?? []) callback();
    },
    registration,
  };
  return value;
}

function fakeDocument() {
  const listeners = new Map<string, (() => void)[]>();
  return {
    readyState: 'complete',
    hidden: false,
    addEventListener: vi.fn((type: string, callback: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), callback]);
    }),
    fire(type: string) {
      for (const callback of listeners.get(type) ?? []) callback();
    },
  };
}

const asContainer = (value: unknown) => value as unknown as ServiceWorkerContainer;
const asDocument = (value: unknown) => value as unknown as Document;

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('offline shell registration', () => {
  it('stays out of the way in development', () => {
    const container = fakeContainer(false);
    registerServiceWorker({
      prod: false,
      container: asContainer(container),
      doc: asDocument(fakeDocument()),
    });
    expect(container.register).not.toHaveBeenCalled();
  });

  it('registers a build-checked worker and looks for a new build on start', async () => {
    const container = fakeContainer(false);
    const doc = fakeDocument();
    registerServiceWorker({
      prod: true,
      base: '/',
      container: asContainer(container),
      doc: asDocument(doc),
      reload: vi.fn(),
    });
    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    await Promise.resolve();
    expect(container.registration.update).toHaveBeenCalledTimes(1);
    doc.fire('visibilitychange');
    expect(container.registration.update).toHaveBeenCalledTimes(2);
  });

  it('reloads once when a new worker replaces one that was controlling the tab', () => {
    const container = fakeContainer(true);
    const reload = vi.fn();
    registerServiceWorker({
      prod: true,
      container: asContainer(container),
      doc: asDocument(fakeDocument()),
      reload,
    });
    container.fire('controllerchange');
    container.fire('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('wave-shell-reloaded')).toBe('1');
  });

  it('does not reload a first-ever install', () => {
    const container = fakeContainer(false);
    const reload = vi.fn();
    registerServiceWorker({
      prod: true,
      container: asContainer(container),
      doc: asDocument(fakeDocument()),
      reload,
    });
    container.fire('controllerchange');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('shouldReloadOnControllerChange', () => {
  it('is false for a fresh install or after one attempt, true for a replacement', () => {
    expect(shouldReloadOnControllerChange(false, false)).toBe(false);
    expect(shouldReloadOnControllerChange(true, true)).toBe(false);
    expect(shouldReloadOnControllerChange(true, false)).toBe(true);
  });
});
