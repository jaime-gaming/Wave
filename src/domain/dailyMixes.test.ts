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
  // A different day reshuffles the fallback order, but the groups stay coherent.
  expect(a.map((g) => g.tracks.map((t) => t.id))).not.toEqual(
    dailyMixes(source, '2026-10-16').map((g) => g.tracks.map((t) => t.id)),
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
  expect(result[0].tracks).toHaveLength(40);
  expect(new Set(result[0].tracks.map((t) => t.id)).size).toBe(40);
  expect(many.map((t) => t.id)).toEqual(ids);
  expect(localDayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
});

it('orders a measured mix by tempo and never repeats an artist back to back', () => {
  const source = Array.from({ length: 6 }, (_, i) =>
    makeTrack({
      id: `t${i}`,
      genres: ['House'],
      artist: i % 2 ? 'Two' : 'One',
    }),
  );
  const features = Object.fromEntries(
    source.map((track, i) => [track.id, { bpm: 140 - i * 5, energy: 0.2 + i * 0.1 }]),
  );
  const [mix] = dailyMixes(source, '2026-10-15', features);
  expect(mix.tracks.map((t) => features[t.id].bpm)).toEqual([115, 120, 125, 130, 135, 140]);
  for (let i = 1; i < mix.tracks.length; i++)
    expect(mix.tracks[i].artist).not.toBe(mix.tracks[i - 1].artist);
  expect(mix.bpm).toBe(127.5);
  expect(mix.descriptor).toContain('BPM');
  expect(mix.descriptor).toContain('6 songs');
});

it('keeps the shuffled order when too little is measured to sort', () => {
  const source = Array.from({ length: 4 }, (_, i) =>
    makeTrack({ id: `u${i}`, genres: ['Folk'], artist: `A${i % 2}` }),
  );
  const [mix] = dailyMixes(source, '2026-10-15', { u0: { bpm: 90 } });
  expect(mix.tracks).toHaveLength(4);
  expect(mix.descriptor).not.toContain('BPM');
});

it('does not turn punctuation-only artist tags into a daily mix', () => {
  const source = ['---', '...', '///'].map((artist, i) =>
    makeTrack({ id: String(i), artist, genres: undefined }),
  );
  expect(dailyMixes(source, '2026-10-15')).toEqual([]);
});
