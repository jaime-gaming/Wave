import { describe, expect, it } from 'vitest';
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

describe('autoplay after the queue ends', () => {
  it('follows on with the next song of the same album', () => {
    const tracks = [
      makeTrack({ id: 'one', title: 'One', artist: 'A', album: 'Record', trackNumber: 1 }),
      makeTrack({ id: 'two', title: 'Two', artist: 'A', album: 'Record', trackNumber: 2 }),
      makeTrack({ id: 'other', title: 'Other', artist: 'B', album: 'Elsewhere' }),
    ];
    const queue = continuationQueue(tracks, tracks[0], [], () => 0, 2);
    expect(queue[0]).toBe('two');
  });

  it('does not open with a song it has just played', () => {
    const tracks = [
      makeTrack({ id: 'a', title: 'A', artist: 'A' }),
      makeTrack({ id: 'b', title: 'B', artist: 'B' }),
      makeTrack({ id: 'c', title: 'C', artist: 'C' }),
    ];
    const queue = continuationQueue(tracks, tracks[0], ['a', 'c', 'b'], () => 0, 2);

    expect(queue[0]).toBe('c');
    expect(new Set(queue).size).toBe(queue.length);
  });

  it('still answers when every song has been heard recently', () => {
    const tracks = [
      makeTrack({ id: 'a', title: 'A', artist: 'A' }),
      makeTrack({ id: 'b', title: 'B', artist: 'A' }),
    ];
    const recent = ['a', 'b', 'a', 'b'];
    expect(continuationQueue(tracks, tracks[0], recent, () => 0.5, 1)).toHaveLength(1);
  });
});
it('excludes missing/empty local sources and invalid remote IDs, deduplicating candidates', () => {
  const current = makeTrack();
  const good = makeTrack({ id: 'good' });
  const remote = makeTrack({
    id: 'remote',
    source: 'youtube',
    blob: undefined,
    videoId: 'abcdefghijk',
  });
  const tracks = [
    current,
    good,
    good,
    remote,
    makeTrack({ id: 'missing', blob: undefined }),
    makeTrack({ id: 'empty', blob: new Blob() }),
    makeTrack({ id: 'invalid', source: 'youtube', videoId: 'bad' }),
  ];
  expect(new Set(continuationQueue(tracks, current, [], () => 0))).toEqual(
    new Set(['good', 'remote']),
  );
});
it('bounds extension batches and handles invalid entropy without duplicate IDs', () => {
  const tracks = Array.from({ length: 30 }, (_, i) => makeTrack({ id: String(i) }));
  expect(continuationQueue(tracks, tracks[0], [], () => NaN, 100)).toHaveLength(20);
  expect(continuationQueue(tracks, tracks[0], [], () => Infinity, 1.8)).toHaveLength(1);
  expect(continuationQueue(tracks, tracks[0], [], () => 0, -1)).toEqual([]);
});

it('steers autoplay automatically toward tracks matching the current musical mood', () => {
  const current = makeTrack({
    id: 'cur',
    title: 'Quiet Ocean Rain',
    artist: 'Calm Artist',
    genres: ['Ambient'],
  });
  const sameMood = makeTrack({
    id: 'chill-next',
    title: 'Soft Piano Breeze',
    artist: 'Gentle Artist',
    genres: ['Lo-fi'],
  });
  const clashingMood = makeTrack({
    id: 'metal-clash',
    title: 'Thunder Fire Storm',
    artist: 'Heavy Band',
    genres: ['Heavy Metal'],
  });
  let chillPicks = 0;
  for (let i = 0; i < 100; i++) {
    if (
      continuationQueue([current, sameMood, clashingMood], current, [], () => i / 100, 1)[0] ===
      'chill-next'
    )
      chillPicks++;
  }
  expect(chillPicks).toBeGreaterThan(75);
});

it('recycles the least recently heard first when the library has been exhausted', () => {
  const tracks = Array.from({ length: 6 }, (_, i) =>
    makeTrack({ id: `${i}`, artist: `Artist ${i}` }),
  );
  const recent = ['0', '1', '2', '3', '4', '5'];
  for (let i = 0; i < 100; i++) {
    const result = continuationQueue(tracks, tracks[5], recent, () => i / 100, 1);
    expect(['0', '1', '2']).toContain(result[0]);
  }
});

it('spreads repeats over consecutive autoplay extensions of a small library', () => {
  const tracks = Array.from({ length: 6 }, (_, i) =>
    makeTrack({ id: `${i}`, artist: `Artist ${i}` }),
  );
  let recent = tracks.map((track) => track.id);
  let current = tracks[5];
  const picked: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [id] = continuationQueue(tracks, current, recent, () => 0.99, 1);
    picked.push(id);
    recent = [...recent, id];
    current = tracks.find((track) => track.id === id)!;
  }
  expect(new Set(picked).size).toBe(4);
});
