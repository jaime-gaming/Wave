import type { IAudioMetadata } from 'music-metadata';
let worker: Worker | undefined,
  unavailable = false,
  sequence = 0,
  idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<
  number,
  {
    resolve: (value: IAudioMetadata) => void;
    reject: (reason?: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function dispose(reason = Error('Metadata worker unavailable.')) {
  worker?.terminate();
  worker = undefined;
  clearTimeout(idle);
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(reason);
  }
  pending.clear();
}
export async function parseLocalMetadata(file: File): Promise<IAudioMetadata> {
  if (typeof Worker !== 'undefined' && !unavailable) {
    try {
      if (!worker) {
        worker = new Worker(new URL('./metadata.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }: { data: { id: number; metadata?: IAudioMetadata } }) => {
          const item = pending.get(data.id);
          if (!item) return;
          pending.delete(data.id);
          clearTimeout(item.timer);
          if (data.metadata) item.resolve(data.metadata);
          else item.reject(Error('Metadata tags unavailable.'));
          if (!pending.size) idle = setTimeout(dispose, 15000);
        };
        worker.onmessageerror = () => {
          unavailable = true;
          dispose();
        };
        worker.onerror = () => {
          unavailable = true;
          dispose();
        };
      }
      clearTimeout(idle);
      const id = ++sequence;
      return await new Promise<IAudioMetadata>((resolve, reject) => {
        const timer = setTimeout(() => dispose(Error('Metadata parsing timed out.')), 30_000);
        pending.set(id, {
          timer,
          resolve,
          reject: (reason) => reject(reason ?? Error('Metadata worker unavailable.')),
        });
        worker!.postMessage({ id, file });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['Metadata tags unavailable.', 'Metadata parsing timed out.'].includes(error.message)
      )
        throw error;
      unavailable = true;
      dispose();
    }
  }
  const { parseBlob } = await import('music-metadata');
  return parseBlob(file);
}
