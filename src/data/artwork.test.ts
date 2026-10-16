import { describe, expect, it } from 'vitest';
import { readArtwork, MAX_ARTWORK_FILE_SIZE } from './artwork';

describe('artwork validation', () => {
  it('rejects SVG and non-image files before decoding', async () => {
    await expect(
      readArtwork(new File(['<svg/>'], 'cover.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('JPEG');
  });
  it('rejects empty and oversized images', async () => {
    await expect(readArtwork(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow(
      '5 MB',
    );
    await expect(
      readArtwork(
        new File([new Uint8Array(MAX_ARTWORK_FILE_SIZE + 1)], 'large.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow('5 MB');
  });
});
