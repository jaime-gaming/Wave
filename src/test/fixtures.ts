import type { Track } from '../domain/types';

export function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'signal',
    title: 'Signal',
    artist: 'Wave Tests',
    album: 'First light',
    duration: 90,
    fileName: 'Signal.wav',
    size: 100,
    addedAt: 1,
    favorite: false,
    blob: new Blob(['audio'], { type: 'audio/wav' }),
    ...overrides,
  };
}
