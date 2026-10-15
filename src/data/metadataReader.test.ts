import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { parseBlob } = vi.hoisted(() => ({ parseBlob: vi.fn() }));
vi.mock('music-metadata', () => ({ parseBlob }));
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: { id: number; metadata?: unknown } }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  parseBlob.mockReset();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('times out a silent worker without blocking the import pipeline or reparsing on the UI thread', async () => {
  const { parseLocalMetadata } = await import('./metadataReader');
  const pending = parseLocalMetadata(new File(['x'], 'stuck.mp3'));
  const failure = expect(pending).rejects.toThrow('Metadata parsing timed out.');
  await vi.advanceTimersByTimeAsync(30_000);
  await failure;
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  expect(parseBlob).not.toHaveBeenCalled();
  const next = parseLocalMetadata(new File(['x'], 'next.mp3')),
    worker = FakeWorker.instances[1];
  const metadata = { common: { title: 'Next' }, format: {}, native: {} };
  worker.onmessage!({ data: { id: worker.postMessage.mock.calls[0][0].id, metadata } });
  await expect(next).resolves.toEqual(metadata);
});
it('clears completed-job deadlines, disposes idle workers and falls back on a worker transport error', async () => {
  const { parseLocalMetadata } = await import('./metadataReader');
  parseBlob.mockResolvedValue({ common: { title: 'Fallback' } });
  const pending = parseLocalMetadata(new File(['x'], 'transport.mp3'));
  FakeWorker.instances[0].onmessageerror!();
  await expect(pending).resolves.toMatchObject({ common: { title: 'Fallback' } });
  expect(parseBlob).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(31_000);
  expect(parseBlob).toHaveBeenCalledTimes(1);
});
it('clears successful job deadlines and releases an idle worker once', async () => {
  const { parseLocalMetadata } = await import('./metadataReader');
  const pending = parseLocalMetadata(new File(['x'], 'valid.mp3')),
    worker = FakeWorker.instances[0];
  worker.onmessage!({
    data: {
      id: worker.postMessage.mock.calls[0][0].id,
      metadata: { common: {}, format: {}, native: {} },
    },
  });
  await pending;
  await vi.advanceTimersByTimeAsync(14999);
  expect(worker.terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15000);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(parseBlob).not.toHaveBeenCalled();
});
