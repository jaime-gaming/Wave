import { it, expect, vi, beforeEach } from 'vitest';
import { readTrack } from './import';
import { parseLocalMetadata } from './metadataReader';
import { readArtwork } from './artwork';
vi.mock('./metadataReader', () => ({ parseLocalMetadata: vi.fn() }));
vi.mock('./artwork', () => ({ readArtwork: vi.fn() }));
beforeEach(() => {
  vi.mocked(readArtwork).mockReset();
});
it('validates imported fields and prioritizes a front cover without changing source bytes', async () => {
  vi.mocked(parseLocalMetadata).mockResolvedValue({
    common: {
      title: '  Signal\0 ',
      artist: 'Wave Tests',
      album: 'First light',
      genre: ['Soul', 'Soul'],
      year: 1998,
      track: { no: 2 },
      disk: { no: 1 },
      picture: [
        { format: 'image/png', type: 'Cover (back)', data: new Uint8Array([1]) },
        { format: 'image/jpeg', type: 'Cover (front)', data: new Uint8Array([2]) },
      ],
    },
    format: { duration: 90, sampleRate: 44100 },
  } as unknown as Awaited<ReturnType<typeof parseLocalMetadata>>);
  vi.mocked(readArtwork).mockResolvedValue('data:image/jpeg;base64,front');
  const file = new File(['original'], 'track.wav');
  const track = await readTrack(file, 'id');
  expect(track).toMatchObject({
    title: 'Signal',
    album: 'First light',
    trackNumber: 2,
    discNumber: 1,
    year: 1998,
    genres: ['Soul'],
    duration: 90,
    metadataCheck: { issues: [] },
  });
  expect(track.blob).toBe(file);
  expect(vi.mocked(readArtwork).mock.calls[0][0].type).toBe('image/jpeg');
});
it('retains good metadata when embedded images are broken and reports the missing cover', async () => {
  vi.mocked(parseLocalMetadata).mockResolvedValue({
    common: {
      title: 'Signal',
      artist: 'Wave Tests',
      album: 'First light',
      track: {},
      disk: {},
      picture: [{ format: 'image/png', data: new Uint8Array([1]) }],
    },
    format: { duration: 90 },
  } as unknown as Awaited<ReturnType<typeof parseLocalMetadata>>);
  vi.mocked(readArtwork).mockRejectedValue(Error('Broken image'));
  const track = await readTrack(new File(['original'], 'file.wav'), 'id');
  expect(track).toMatchObject({
    title: 'Signal',
    artist: 'Wave Tests',
    album: 'First light',
    metadataCheck: { issues: ['artwork'] },
  });
});
