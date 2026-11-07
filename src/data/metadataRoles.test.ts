import { beforeEach, expect, it } from 'vitest';
import { getTracks, openLibrary, reviewTrackRoles, saveTrack, editTrackMetadata } from './library';
import { metadataIssues } from '../domain/metadata';
import { makeTrack } from '../test/fixtures';

beforeEach(async () => {
  const db = await openLibrary();
  await db.clear('tracks');
  db.close();
});
const swapped = () =>
  makeTrack({ title: 'Nils Frahm', artist: 'Says', fileName: 'Nils Frahm - Says.mp3' });
it('persists correction, preserves the file and clears the roles warning after reloading', async () => {
  const track = swapped();
  await saveTrack(track);
  const before = (await getTracks())[0].blob;
  await reviewTrackRoles(track.id, 'swap');
  const [saved] = await getTracks();
  expect(saved).toMatchObject({ title: 'Says', artist: 'Nils Frahm', fileName: track.fileName });
  expect(saved.blob).toEqual(before);
  expect(saved.size).toBe(track.size);
  expect(metadataIssues(saved)).not.toContain('roles');
  expect(saved.originalMetadata?.title).toBe(track.title);
});
it('confirmation leaves the chosen tags alone and survives storage', async () => {
  await saveTrack(swapped());
  await reviewTrackRoles('signal', 'keep');
  const [saved] = await getTracks();
  expect(saved.title).toBe('Nils Frahm');
  expect(metadataIssues(saved)).not.toContain('roles');
});
it('an explicit song edit also resolves a filename disagreement', async () => {
  const track = swapped();
  await saveTrack(track);
  await editTrackMetadata(track.id, { title: ' Nils Frahm ', artist: ' Says ', album: 'Spaces' });
  expect(metadataIssues((await getTracks())[0])).not.toContain('roles');
});

it('retains real word timings when the library is reloaded', async () => {
  const lyrics = {
    raw: '[00:01]Hello world',
    offsetMs: 0,
    source: 'netease' as const,
    provider: 'NetEase',
    lines: [
      {
        text: 'Hello world',
        time: 1,
        words: [
          { text: 'Hello ', time: 1, end: 2 },
          { text: 'world', time: 2, end: 3 },
        ],
      },
    ],
  };
  await saveTrack(makeTrack({ lyrics }));
  expect((await getTracks())[0].lyrics).toMatchObject({
    source: 'netease',
    provider: 'NetEase',
    lines: lyrics.lines,
  });
});
