import { type VolumeFix } from './volumeAnalysis';
export type { VolumeFix } from './volumeAnalysis';
export async function measureVolume(blob: Blob, duration: number): Promise<VolumeFix> {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600 || blob.size > 48 * 1024 * 1024)
    throw Error('Fix volume supports local recordings up to 10 minutes and 48 MB.');
  if (typeof OfflineAudioContext === 'undefined' || typeof AudioContext === 'undefined')
    throw Error('Fix volume is not available in this browser.');
  const context = new OfflineAudioContext(2, 1, 22050);
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
    decoded.getChannelData(i).slice(),
  );
  const result = await new Promise<Omit<VolumeFix, 'measuredAt'>>((resolve, reject) => {
    const worker = new Worker(new URL('./volume.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error('Volume analysis timed out.'));
    }, 30_000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.error) reject(Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(Error('Volume analysis failed.'));
    };
    worker.postMessage(
      { channels, sampleRate: decoded.sampleRate },
      channels.map((channel) => channel.buffer),
    );
  });
  return { ...result, measuredAt: Date.now() };
}
