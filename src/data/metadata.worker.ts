import { parseBlob } from 'music-metadata';
self.onmessage = async (event: MessageEvent<{ id: number; file: File }>) => {
  const { id, file } = event.data;
  try {
    const metadata = await parseBlob(file);
    self.postMessage({ id, metadata });
  } catch {
    self.postMessage({ id, error: true });
  }
};
