export function wav(
  title: string,
  duration = 4,
  sampleRate = 8000,
  bitsPerSample = 16,
  artist = 'Wave Tests',
  album = 'First light',
  genre?: string,
) {
  const bytesPerSample = bitsPerSample / 8;
  const data = Buffer.alloc(sampleRate * duration * bytesPerSample);
  for (let i = 0; i < data.length / bytesPerSample; i++)
    data.writeIntLE(
      Math.round(
        Math.sin((i / sampleRate) * 440 * Math.PI * 2) * (bitsPerSample === 24 ? 128000 : 1000),
      ),
      i * bytesPerSample,
      bytesPerSample,
    );
  const chunk = (id: string, bytes: Buffer) => {
    const result = Buffer.alloc(8 + bytes.length + (bytes.length % 2));
    result.write(id, 0);
    result.writeUInt32LE(bytes.length, 4);
    bytes.copy(result, 8);
    return result;
  };
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * bytesPerSample, 8);
  format.writeUInt16LE(bytesPerSample, 12);
  format.writeUInt16LE(bitsPerSample, 14);
  const info = Buffer.concat([
    Buffer.from('INFO'),
    chunk('INAM', Buffer.from(`${title}\0`, 'latin1')),
    chunk('IART', Buffer.from(`${artist}\0`, 'latin1')),
    chunk('IPRD', Buffer.from(`${album}\0`, 'latin1')),
    ...(genre ? [chunk('IGNR', Buffer.from(`${genre}\0`, 'latin1'))] : []),
  ]);
  const body = Buffer.concat([
    Buffer.from('WAVE'),
    chunk('fmt ', format),
    chunk('LIST', info),
    chunk('data', data),
  ]);
  const header = Buffer.alloc(8);
  header.write('RIFF');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
