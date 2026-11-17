import { expect, it } from 'vitest';
import { dailyMixes, localDayKey, mixCovers } from './dailyMixes';
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
  expect(result[0].tracks).toHaveLength(20);
  expect(new Set(result[0].tracks.map((t) => t.id)).size).toBe(20);
  expect(many.map((t) => t.id)).toEqual(ids);
  expect(localDayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
});

it('shapes a measured mix with daily flow variety and never repeats an artist back to back', () => {
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
  const [mixA] = dailyMixes(source, '2026-10-15', features);
  const [mixB] = dailyMixes(source, '2026-10-16', features);
  const [mixC] = dailyMixes(source, '2026-10-17', features);
  expect(mixA.tracks).toHaveLength(6);
  for (let i = 1; i < mixA.tracks.length; i++)
    expect(mixA.tracks[i].artist).not.toBe(mixA.tracks[i - 1].artist);
  // Across consecutive days, measured mixes rotate contours instead of playing the exact same order.
  const orders = new Set([mixA, mixB, mixC].map((m) => m.tracks.map((t) => t.id).join(',')));
  expect(orders.size).toBeGreaterThan(1);
  expect(mixA.bpm).toBe(127.5);
  expect(mixA.descriptor).toContain('BPM');
  expect(mixA.descriptor).toContain('6 songs');
});

it('caps any dominant artist and spaces artists widely to prevent artist burnout', () => {
  const dominant = Array.from({ length: 18 }, (_, i) =>
    makeTrack({ id: `dom-${i}`, artist: 'Dominant Band', genres: ['Indie'] }),
  );
  const varied = Array.from({ length: 8 }, (_, a) =>
    Array.from({ length: 3 }, (_, i) =>
      makeTrack({ id: `v-${a}-${i}`, artist: `Indie Act ${a}`, genres: ['Indie'] }),
    ),
  ).flat();
  const [mix] = dailyMixes([...dominant, ...varied], '2026-11-16');
  expect(mix.tracks).toHaveLength(20);
  const dominantCount = mix.tracks.filter((t) => t.artist === 'Dominant Band').length;
  expect(dominantCount).toBeLessThanOrEqual(3);
  for (let i = 1; i < mix.tracks.length; i++) {
    expect(mix.tracks[i].artist).not.toBe(mix.tracks[i - 1].artist);
  }
});

it('builds multi-artist mood mixes instead of single-artist mixes when genre tags are missing', () => {
  const untagged = [
    makeTrack({ id: 'u1', title: 'Ocean Rain', artist: 'Artist One', genres: undefined }),
    makeTrack({ id: 'u2', title: 'Quiet Sleep', artist: 'Artist Two', genres: undefined }),
    makeTrack({ id: 'u3', title: 'Soft Breeze', artist: 'Artist Three', genres: undefined }),
    makeTrack({ id: 'u4', title: 'Gentle Waves', artist: 'Artist Four', genres: undefined }),
  ];
  const mixes = dailyMixes(untagged, '2026-11-16');
  expect(mixes.length).toBeGreaterThanOrEqual(1);
  expect(mixes[0].basis).toBe('mood');
  expect(new Set(mixes[0].tracks.map((t) => t.artist)).size).toBeGreaterThanOrEqual(3);
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

it('offers at most three simultaneous mixes with no more than twenty songs each', () => {
  const source = Array.from({ length: 5 }, (_, genre) =>
    Array.from({ length: 35 }, (_, index) =>
      makeTrack({ id: `${genre}-${index}`, genres: [`Style ${genre}`] }),
    ),
  ).flat();
  const result = dailyMixes(source, '2026-11-06');
  expect(result).toHaveLength(3);
  expect(result.every((mix) => mix.tracks.length === 20)).toBe(true);
  expect(result.every((mix) => new Set(mix.tracks.map((track) => track.id)).size === 20)).toBe(
    true,
  );
});

it('locks distinct cover sleeves for the day independent of playback ordering or BPM analysis', () => {
  const source = Array.from({ length: 8 }, (_, i) =>
    makeTrack({
      id: `c${i}`,
      artist: `Band ${i}`,
      genres: ['Dream Pop'],
      artwork: `art:${i % 4}`,
    }),
  );
  const unmeasured = dailyMixes(source, '2026-11-16');
  const measured = dailyMixes(
    source,
    '2026-11-16',
    Object.fromEntries(source.map((t, i) => [t.id, { bpm: 80 + i * 10, energy: 0.2 + i * 0.08 }])),
  );
  expect(unmeasured[0].covers).toHaveLength(3);
  expect(new Set(unmeasured[0].covers.map((t) => t.artwork)).size).toBe(3);
  expect(measured[0].covers.map((t) => t.id)).toEqual(unmeasured[0].covers.map((t) => t.id));
  expect(
    mixCovers([...source].reverse(), 'genre:dream pop', '2026-11-16').map((t) => t.id),
  ).toEqual(mixCovers(source, 'genre:dream pop', '2026-11-16').map((t) => t.id));
});
