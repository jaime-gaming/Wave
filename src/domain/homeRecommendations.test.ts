import { expect, it } from 'vitest';
import { homeRecommendations } from './homeRecommendations';
import { listeningSummary, makePlay } from './listening';
import { makeTrack } from '../test/fixtures';

it('is stable for the day, independent of input order and never mutates the library', () => {
  const tracks = Array.from({ length: 20 }, (_, i) =>
    makeTrack({ id: `${i}`, artist: `Artist ${i % 4}` }),
  );
  const original = tracks.map((track) => track.id);
  const a = homeRecommendations(tracks, undefined, '2026-11-05');
  expect(a).toEqual(homeRecommendations([...tracks].reverse(), undefined, '2026-11-05'));
  expect(a).not.toEqual(homeRecommendations(tracks, undefined, '2026-11-06'));
  expect(tracks.map((track) => track.id)).toEqual(original);
  expect(new Set(a.map((track) => track.id)).size).toBe(12);
  for (let i = 1; i < a.length; i++) expect(a[i].artist).not.toBe(a[i - 1].artist);
});
it('balances affinity with discovery and moves the just-heard song back', () => {
  const tracks = [
    makeTrack({ id: 'heard' }),
    makeTrack({ id: 'discovery' }),
    makeTrack({ id: 'other', artist: 'Other' }),
  ];
  const summary = listeningSummary([makePlay('heard', Date.now(), 90, true)], tracks, Date.now());
  const picks = homeRecommendations(tracks, summary, 'today');
  expect(picks[0].id).toBe('discovery');
  expect(picks.at(-1)?.id).toBe('heard');
});
