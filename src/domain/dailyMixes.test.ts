import { expect, it } from 'vitest';
import { dailyMixes, localDayKey } from './dailyMixes';
import { makeTrack } from '../test/fixtures';
const tracks = () =>
  ['Rock', 'Jazz', 'Electronic'].flatMap((genre, g) =>
    Array.from({ length: 7 }, (_, i) =>
      makeTrack({ id: `${g}-${i}`, title: `Song ${i}`, artist: `Artist ${g}`, genres: [genre] }),
    ),
  );
it('makes three disjoint coherent groups, stable within the day and independent of input order', () => {
  const source = tracks(),
    a = dailyMixes(source, '2026-10-15');
  expect(a).toHaveLength(3);
  expect(a.map((g) => g.tracks.map((t) => t.id))).toEqual(
    dailyMixes([...source].reverse(), '2026-10-15').map((g) => g.tracks.map((t) => t.id)),
  );
  expect(new Set(a.flatMap((g) => g.tracks.map((t) => t.id))).size).toBe(21);
  for (const mix of a) expect(new Set(mix.tracks.map((t) => t.genres![0])).size).toBe(1);
  expect(a.map((g) => g.tracks[0].id)).not.toEqual(
    dailyMixes(source, '2026-10-16').map((g) => g.tracks[0].id),
  );
});
it('does not fabricate three groups or classify unknown artists/genres', () => {
  expect(dailyMixes([makeTrack()], '2026-10-15')).toEqual([]);
  const same = Array.from({ length: 4 }, (_, i) => makeTrack({ id: String(i), genres: undefined }));
  expect(dailyMixes(same, '2026-10-15')).toMatchObject([{ basis: 'artist', label: 'Wave Tests' }]);
  expect(
    dailyMixes(
      same.map((t) => ({ ...t, artist: 'Unknown artist', genres: ['Unknown', '---'] })),
      '2026-10-15',
    ),
  ).toEqual([]);
});
it('caps results, does not mutate originals, deduplicates IDs and uses local calendar dates', () => {
  const many = Array.from({ length: 60 }, (_, i) => makeTrack({ id: String(i), genres: ['Rock'] }));
  const ids = many.map((t) => t.id);
  const result = dailyMixes([...many, many[0]], '2026-10-15');
  expect(result[0].tracks).toHaveLength(30);
  expect(new Set(result[0].tracks.map((t) => t.id)).size).toBe(30);
  expect(many.map((t) => t.id)).toEqual(ids);
  expect(localDayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
});

it('does not turn punctuation-only artist tags into a daily mix', () => {
  const source = ['---', '...', '///'].map((artist, i) =>
    makeTrack({ id: String(i), artist, genres: undefined }),
  );
  expect(dailyMixes(source, '2026-10-15')).toEqual([]);
});
