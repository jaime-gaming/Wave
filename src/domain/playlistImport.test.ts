import { describe, expect, it } from 'vitest';
import {
  chooseCandidate,
  matchEntries,
  MAX_IMPORT_ENTRIES,
  scoreCandidate,
  suggestedPlaylistName,
} from './playlistImport';
import type { ImportedEntry, MatchCandidate } from './playlistImport';

const candidate = (over: Partial<MatchCandidate> & { id: string }): MatchCandidate => ({
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  ...over,
});
const entry = (over: Partial<ImportedEntry> & { id: string }): ImportedEntry => ({
  title: 'Song',
  artist: 'Artist',
  duration: 200,
  ...over,
});

describe('playlist import matching', () => {
  it('matches identical songs and tolerates provider title noise', () => {
    expect(scoreCandidate(entry({ id: 'e1' }), candidate({ id: 't1' }))).toEqual({ score: 1 });
    expect(
      scoreCandidate(entry({ id: 'e2', title: 'Song (Official Video)' }), candidate({ id: 't2' }))
        .score,
    ).toBeGreaterThanOrEqual(0.82);
    expect(
      scoreCandidate(
        entry({ id: 'e3', title: 'Song (Remastered 2011)', artist: 'Artist feat. Other' }),
        candidate({ id: 't3', title: 'Song' }),
      ).score,
    ).toBeGreaterThanOrEqual(0.82);
  });

  it('rejects a same-title song with a very different duration', () => {
    expect(
      scoreCandidate(entry({ id: 'e1', duration: 200 }), candidate({ id: 't1', duration: 420 })),
    ).toEqual({ score: 0 });
  });

  it('does not accept a merely similar title without the artist', () => {
    const breakdown = scoreCandidate(
      entry({ id: 'e1', title: 'Love Story', artist: 'Nobody Known' }),
      candidate({ id: 't1', title: 'Love Story', artist: 'Taylor Swift' }),
    );
    expect(breakdown.score).toBeLessThan(0.82);
  });

  it('assigns the strongest pair first and never reuses a local song', () => {
    const report = matchEntries(
      [
        entry({ id: 'e1', title: 'Intro', artist: 'Band' }),
        entry({ id: 'e2', title: 'Song', artist: 'Artist' }),
      ],
      [candidate({ id: 't1' }), candidate({ id: 't2', title: 'Intro', artist: 'Band' })],
    );
    expect(report.matches.map((match) => [match.entry.id, match.status, match.trackId])).toEqual([
      ['e1', 'matched', 't2'],
      ['e2', 'matched', 't1'],
    ]);
    expect(report.trackIds).toEqual(['t2', 't1']);
  });

  it('reports ambiguity, missing songs and manual choices deterministically', () => {
    const report = matchEntries(
      [
        entry({ id: 'e1', title: 'Song', artist: 'Artist', duration: 200 }),
        entry({ id: 'e2', title: 'Unrelated Track', artist: 'Someone Else' }),
      ],
      [candidate({ id: 't1', album: 'One' }), candidate({ id: 't2', album: 'Two' })],
    );
    // Both candidates score identically, so the entry needs review.
    expect(report.matches[0].status).toBe('ambiguous');
    expect(report.matches[0].alternatives.length).toBe(1);
    expect(report.matches[1].status).toBe('missing');
    expect(report.matchedCount).toBe(0);
    expect(report.ambiguousCount).toBe(1);
    expect(report.missingCount).toBe(1);
    expect(report.trackIds).toEqual([]);

    const chosen = chooseCandidate(report, 0, 't2');
    expect(chosen.matches[0]).toMatchObject({ status: 'matched', trackId: 't2' });
    expect(chosen.trackIds).toEqual(['t2']);
    expect(() => chooseCandidate(report, 9, 't1')).toThrow();
  });

  it('frees a duplicate choice when the user assigns that song elsewhere', () => {
    const report = matchEntries(
      [entry({ id: 'e1' }), entry({ id: 'e2', title: 'Intro', artist: 'Band' })],
      [candidate({ id: 't1' }), candidate({ id: 't2', title: 'Intro', artist: 'Band' })],
    );
    expect(report.trackIds).toEqual(['t1', 't2']);
    const reassigned = chooseCandidate(report, 1, 't1');
    expect(reassigned.matches[0].status).toBe('ambiguous');
    expect(reassigned.matches[1]).toMatchObject({ status: 'matched', trackId: 't1' });
    expect(reassigned.trackIds).toEqual(['t1']);
  });

  it('keeps entry order, ignores empty entries and sanitizes playlist names', () => {
    const report = matchEntries(
      [entry({ id: 'e1', title: '  ' }), entry({ id: 'e2' })],
      [candidate({ id: 't1' })],
    );
    expect(report.matches.map((match) => match.entry.id)).toEqual(['e1', 'e2']);
    expect(report.matches[0].status).toBe('missing');
    expect(report.trackIds).toEqual(['t1']);
    expect(suggestedPlaylistName('  My   Mix ', 'Spotify')).toBe('My Mix');
    expect(suggestedPlaylistName(undefined, 'YouTube')).toBe('Imported YouTube playlist');
    expect(suggestedPlaylistName('x'.repeat(400), 'Spotify')).toHaveLength(120);
  });

  it('is stable across repeated runs with equal scores', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2' })];
    const candidates = [candidate({ id: 't2' }), candidate({ id: 't1' })];
    expect(matchEntries(entries, candidates)).toEqual(matchEntries(entries, candidates));
  });
});

describe('playlist import at library scale', () => {
  const words = [
    'love',
    'night',
    'blue',
    'fire',
    'rain',
    'gold',
    'heart',
    'city',
    'dream',
    'light',
  ];
  const largeLibrary: MatchCandidate[] = Array.from({ length: 5_000 }, (_, index) => ({
    id: `t${index}`,
    title: `${words[index % 10]} ${words[(index * 3) % 10]} ${index}`,
    artist: `Artist ${index % 300}`,
    album: `Album ${index % 120}`,
    duration: 120 + (index % 200),
  }));
  const largePlaylist: ImportedEntry[] = Array.from({ length: 300 }, (_, index) => ({
    id: `e${index}`,
    title: `${words[(index * 7) % 10]} ${words[(index * 3) % 10]} ${index}`,
    artist: `Artist ${index % 300}`,
    duration: 150,
  }));

  it('matches a 300-song playlist against 5 000 local songs quickly', () => {
    const started = Date.now();
    const report = matchEntries(largePlaylist, largeLibrary);
    const elapsed = Date.now() - started;
    // The exhaustive version of this workload took ~14 s and froze the page.
    expect(elapsed).toBeLessThan(4_000);
    expect(report.matches).toHaveLength(300);
    expect(report.matchedCount + report.ambiguousCount + report.missingCount).toBe(300);
  });

  it('produces exactly the same result as the exhaustive comparison', () => {
    const entries = largePlaylist.slice(0, 40);
    expect(JSON.stringify(matchEntries(entries, largeLibrary))).toBe(
      JSON.stringify(matchEntries(entries, largeLibrary, { exhaustive: true })),
    );
  });

  it('refuses absurdly large playlists instead of exhausting memory', () => {
    const entries = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_, index) =>
      entry({ id: `e${index}` }),
    );
    expect(() => matchEntries(entries, largeLibrary)).toThrow(/cannot have more than/);
  });
});
