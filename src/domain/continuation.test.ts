import { expect, it } from 'vitest';
import { continuationQueue } from './continuation';
import { makeTrack } from '../test/fixtures';
it('avoids current/recent tracks, contains unique local IDs and respects the limit', () => {
  const tracks = ['a', 'b', 'c', 'd'].map((id) => makeTrack({ id }));
  expect(continuationQueue(tracks, tracks[0], ['b'], () => 0.2)).toEqual(['c', 'd']);
  expect(continuationQueue(tracks, tracks[0], [], () => 0.2, 1)).toHaveLength(1);
  expect(continuationQueue([tracks[0]], tracks[0], [])).toEqual([]);
  expect(new Set(continuationQueue(tracks, tracks[0], ['b', 'c', 'd'])).size).toBe(3);
});
it('uses weighted context rather than an unstructured shuffle', () => {
  const current = makeTrack({
    id: 'a',
    artist: 'One',
    album: 'Album',
    genres: ['Soul'],
    year: 1998,
  });
  const related = makeTrack({
    id: 'b',
    artist: 'One',
    album: 'Album',
    genres: ['Soul'],
    year: 1999,
  });
  const distant = makeTrack({
    id: 'c',
    artist: 'Other',
    album: 'Elsewhere',
    genres: ['Metal'],
    year: 2025,
  });
  let relatedCount = 0;
  for (let i = 0; i < 100; i++)
    if (continuationQueue([current, related, distant], current, [], () => i / 100, 1)[0] === 'b')
      relatedCount++;
  expect(relatedCount).toBeGreaterThan(70);
});
