import { amplitudeEnvelope, type EnergyEnvelope } from '../domain/musicEnergy';
const cache = new WeakMap<Blob, Promise<EnergyEnvelope | undefined>>();
export function sourceEnvelope(blob: Blob, duration: number) {
  if (cache.has(blob)) return cache.get(blob)!;
  const work = (async () => {
    // Bound extra decode memory; unsupported/large sources keep a still background.
    if (
      blob.size > 24 * 1024 * 1024 ||
      duration > 1200 ||
      typeof OfflineAudioContext === 'undefined'
    )
      return;
    try {
      const context = new OfflineAudioContext(1, 1, 22050);
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      return amplitudeEnvelope(
        Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)),
        decoded.sampleRate,
      );
    } catch {
      return;
    }
  })();
  cache.set(blob, work);
  return work;
}
