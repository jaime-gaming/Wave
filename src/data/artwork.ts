export const MAX_ARTWORK_FILE_SIZE = 5 * 1024 * 1024;
export const ARTWORK_ACCEPT = 'image/jpeg,image/png,image/webp';

export async function readArtwork(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (!file.size || file.size > MAX_ARTWORK_FILE_SIZE)
    throw new Error('Choose a nonempty image up to 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This image could not be read.'));
      image.src = url;
    });
    if (image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error('Choose an image of up to 40 megapixels.');
    const canvas = document.createElement('canvas');
    // 384 px is twice the largest place artwork is drawn (Now Playing), and the
    // difference in file size matters when a library holds thousands of songs:
    // every cover is stored as text in the library record.
    const edge = Math.min(384, image.naturalWidth, image.naturalHeight);
    canvas.width = canvas.height = edge;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image editing is unavailable in this browser.');
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.fillStyle = '#1d2230';
    ctx.fillRect(0, 0, edge, edge);
    ctx.drawImage(
      image,
      (image.naturalWidth - crop) / 2,
      (image.naturalHeight - crop) / 2,
      crop,
      crop,
      0,
      0,
      edge,
      edge,
    );
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
