import { describe, expect, it } from 'vitest';
import { fileIdentity, isAudioFile, isLegacyAudioFile, readTrack } from './import';

describe('audio import', () => {
  it('accepts known extensions irrespective of case and rejects unrelated files', () => {
    expect(isAudioFile(new File(['x'], 'track.MP3'))).toBe(true);
    expect(isAudioFile(new File(['x'], 'track.flac'))).toBe(false);
    expect(isAudioFile(new File(['x'], 'track.wav'))).toBe(true);
    expect(isAudioFile(new File(['x'], 'track.M4A'))).toBe(true);
    expect(isAudioFile(new File(['x'], 'track.ogg'))).toBe(true);
    expect(isLegacyAudioFile(new File(['x'], 'track.flac'))).toBe(true);
    expect(isLegacyAudioFile(new File(['x'], 'track.mp3'))).toBe(false);
    expect(isAudioFile(new File(['x'], 'track.txt', { type: 'audio/mpeg' }))).toBe(false);
  });
  it('uses stable file identity and distinguishes filename, size, and modification time', async () => {
    const first = new File(['audio'], 'Signal.wav', { lastModified: 1 });
    expect(await fileIdentity(first)).toBe(
      await fileIdentity(new File(['audio'], 'Signal.wav', { lastModified: 1 })),
    );
    for (const file of [
      new File(['audio'], 'Other.wav', { lastModified: 1 }),
      new File(['changed'], 'Signal.wav', { lastModified: 1 }),
      new File(['audio'], 'Signal.wav', { lastModified: 2 }),
    ]) {
      expect(await fileIdentity(file)).not.toBe(await fileIdentity(first));
    }
  });
  it('retains a file with fallback tags when metadata is malformed', async () => {
    const file = new File(['not a real WAV'], 'My.song.wav', { type: 'audio/wav' });
    expect(await readTrack(file, 'test')).toMatchObject({
      id: 'test',
      title: 'My.song',
      artist: 'Unknown artist',
      album: 'Unknown album',
      duration: 0,
      favorite: false,
      blob: file,
    });
  });
});
it('identifies byte-equal renamed files and distinguishes different content', async () => {
  const { contentIdentity } = await import('./import');
  const hash = await contentIdentity(new File(['music'], 'original.wav', { lastModified: 1 }));
  expect(hash).toHaveLength(64);
  expect(await contentIdentity(new File(['music'], 'renamed.flac', { lastModified: 999 }))).toBe(
    hash,
  );
  expect(await contentIdentity(new File(['other'], 'original.wav', { lastModified: 1 }))).not.toBe(
    hash,
  );
});
it('uses filename identity as a fallback without changing original audio bytes', async () => {
  const file = new File(['original malformed bytes'], '01 - Artist — Song (Live).wav', {
    type: 'audio/wav',
  });
  const result = await readTrack(file, 'fallback');
  expect(result).toMatchObject({
    title: 'Song (Live)',
    artist: 'Artist',
    fileName: file.name,
    blob: file,
    size: file.size,
  });
  expect(result.blob).toBe(file);
});
